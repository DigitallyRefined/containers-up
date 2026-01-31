import type { Logger } from 'pino';

const SQUASH_UPDATE_MESSAGE = process.env.SQUASH_UPDATE_MESSAGE || 'Update dependencies';
const SQUASH__DEPS_DAYS_AGO = Number.parseInt(process.env.SQUASH_DAYS_AGO || '5');
const SQUASH_MAX_UPDATE_COMMITS = Number.parseInt(process.env.SQUASH_MAX_UPDATE_COMMITS || '5');

const buildMessage = (subject: string, body?: string) => {
  const parts = [subject, body].filter(Boolean);
  return `${SQUASH_UPDATE_MESSAGE}\n\n${parts.join('\n')}`;
};

const gitCommitWithMessage = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  message: string,
  amend = false,
  authorDate?: string
) => {
  const amendFlag = amend ? ' --amend' : '';
  const dateFlag = authorDate ? ` --date='${authorDate}'` : '';
  // Use base64 encoding to avoid all shell escaping issues
  const base64Message = Buffer.from(message).toString('base64');
  await sshRun(`echo '${base64Message}' | base64 -d | git commit${amendFlag}${dateFlag} -F -`);
};

const hasUncommittedChanges = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>
): Promise<boolean> => {
  const status = await sshRun('git status --porcelain');
  return !!status.stdout.trim();
};

const getCommitMetadata = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  skipCount = 0
) => {
  const skip = skipCount > 0 ? `--skip=${skipCount} ` : '';
  const subject = (await sshRun(`git log -1 ${skip}--format=%s`)).stdout.trim();
  const body = (await sshRun(`git log -1 ${skip}--format=%b`)).stdout.trim();
  const authorDate = (await sshRun(`git log -1 ${skip}--format=%aI`)).stdout.trim();
  const authorName = (await sshRun(`git log -1 ${skip}--format=%an`)).stdout.trim();
  const timestamp =
    Number.parseInt((await sshRun(`git log -1 ${skip}--format=%at`)).stdout.trim()) * 1000;

  return {
    subject,
    body,
    authorDate,
    authorName,
    timestamp,
  };
};

const updateCurrentCommit = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  subject: string,
  body: string
) => {
  await gitCommitWithMessage(sshRun, buildMessage(subject, body), true);
};

const squashLastTwoCommits = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  lastSubject: string,
  lastBody: string,
  prevBody: string,
  prevAuthorDate: string
) => {
  const messageParts = [lastSubject, lastBody, prevBody]
    .filter(Boolean)
    .filter((part) => !part.includes(SQUASH_UPDATE_MESSAGE));

  const finalMessage = messageParts.length
    ? `${SQUASH_UPDATE_MESSAGE}\n\n${messageParts.join('\n')}`
    : SQUASH_UPDATE_MESSAGE;

  await sshRun('git reset --soft HEAD~2');
  await gitCommitWithMessage(sshRun, finalMessage, false, prevAuthorDate);
};

const squashOldestTwoCommits = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  checkCommitCount: number
) => {
  // Collect all commit data before making changes
  const commits = [];
  for (let i = checkCommitCount - 1; i >= 0; i--) {
    const subject = (await sshRun(`git log -1 HEAD~${i} --format=%s`)).stdout.trim();
    const body = (await sshRun(`git log -1 HEAD~${i} --format=%b`)).stdout.trim();
    const tree = (await sshRun(`git rev-parse HEAD~${i}^{tree}`)).stdout.trim();
    const authorDate = (await sshRun(`git log -1 HEAD~${i} --format=%aI`)).stdout.trim();
    commits.push({ subject, body, tree, authorDate });
  }

  // Build squashed message from 2 oldest commits
  const squashedParts = [commits[0].subject, commits[0].body, commits[1].subject, commits[1].body]
    .filter(Boolean)
    .filter((part) => !part.includes(SQUASH_UPDATE_MESSAGE));

  const squashedMessage = squashedParts.length
    ? `${SQUASH_UPDATE_MESSAGE}\n\n${squashedParts.join('\n')}`
    : SQUASH_UPDATE_MESSAGE;

  // Reset to parent commit
  await sshRun(`git reset --hard HEAD~${checkCommitCount}`);

  // Create squashed commit with tree from 2nd oldest, preserving oldest author date
  const base64Msg = Buffer.from(squashedMessage).toString('base64');
  const newHash = (
    await sshRun(
      `echo '${base64Msg}' | base64 -d | env GIT_AUTHOR_DATE='${commits[0].authorDate}' git commit-tree ${commits[1].tree} -p HEAD`
    )
  ).stdout.trim();
  await sshRun(`git reset --hard ${newHash}`);

  // Recreate remaining commits with their original author dates
  for (let i = 2; i < commits.length; i++) {
    const msg = commits[i].body
      ? `${commits[i].subject}\n\n${commits[i].body}`
      : commits[i].subject;
    const b64 = Buffer.from(msg).toString('base64');
    const hash = (
      await sshRun(
        `echo '${b64}' | base64 -d | env GIT_AUTHOR_DATE='${commits[i].authorDate}' git commit-tree ${commits[i].tree} -p HEAD`
      )
    ).stdout.trim();
    await sshRun(`git reset --hard ${hash}`);
  }
};

const pushToRemote = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  logger: Logger
) => {
  const branchResult = await sshRun('git branch --show-current');
  const currentBranch = branchResult.stdout.trim();
  logger.info(`Pushing to branch: ${currentBranch}`);

  const remoteResult = await sshRun(`git config branch.${currentBranch}.remote || echo origin`);
  const remote = remoteResult.stdout.trim();

  await sshRun(`git push --force-with-lease ${remote} ${currentBranch}`);
};

export const squashUpdates = async (
  sshRun: (cmd: string) => Promise<{ stdout: string }>,
  logger: Logger
) => {
  logger.info('Squashing dependency update commits');

  // Check for uncommitted changes
  if (await hasUncommittedChanges(sshRun)) {
    logger.info('Skipping squash: uncommitted changes detected');
    return;
  }

  // Keep squashing while the previous commit is from an automated author
  let continueSquashing = true;
  let loopCount = 0;
  const MAX_SQUASH_LOOPS = 50; // To prevent infinite loops

  while (continueSquashing && loopCount < MAX_SQUASH_LOOPS) {
    loopCount++;
    logger.info(`Squash loop iteration ${loopCount}`);

    // Get current commit info (needs to be inside loop as HEAD changes after each squash)
    const lastCommit = await getCommitMetadata(sshRun, 0);

    // Get previous commit info
    const prevCommit = await getCommitMetadata(sshRun, 1);

    const isAutomatedAuthor = /dependabot|renovate/i.test(prevCommit.authorName);

    // If previous commit is not from automated author, stop squashing
    if (!isAutomatedAuthor) {
      continueSquashing = false;
    } else {
      // Previous commit is from automated author, squash them together
      logger.info(`Squashing last 2 commits together (previous author: ${prevCommit.authorName})`);
      await squashLastTwoCommits(
        sshRun,
        lastCommit.subject,
        lastCommit.body,
        prevCommit.body,
        prevCommit.authorDate
      );
    }
  }

  if (loopCount >= MAX_SQUASH_LOOPS) {
    logger.warn(`Reached maximum squash loop limit of ${MAX_SQUASH_LOOPS}`);
  }

  // Get current commit info after squashing
  const lastCommit = await getCommitMetadata(sshRun, 0);
  const prevCommit = await getCommitMetadata(sshRun, 1);

  const DAYS_AGO = Date.now() - SQUASH__DEPS_DAYS_AGO * 24 * 60 * 60 * 1000;

  // If previous commit is old or doesn't start with "Update dependencies", just update current commit
  if (prevCommit.timestamp < DAYS_AGO || !prevCommit.subject.includes(SQUASH_UPDATE_MESSAGE)) {
    logger.info('Updating current commit message only (previous is old or not an update commit)');
    await updateCurrentCommit(sshRun, lastCommit.subject, lastCommit.body);
  }

  // After squashing, check if we've exceeded the max number of update commits
  const checkCommitCount = SQUASH_MAX_UPDATE_COMMITS + 1;
  const recentCommits = await sshRun(`git log -${checkCommitCount} --format="%s"`);
  const commitSubjects = recentCommits.stdout.trim().split('\n');

  if (
    commitSubjects.length >= checkCommitCount &&
    commitSubjects.every((line) => line.includes(SQUASH_UPDATE_MESSAGE))
  ) {
    logger.info(
      `Squashing 2 oldest of ${checkCommitCount} "Update dependencies" commits to maintain max of ${SQUASH_MAX_UPDATE_COMMITS}`
    );
    await squashOldestTwoCommits(sshRun, checkCommitCount);
  }

  await pushToRemote(sshRun, logger);
  logger.info('Finished squashing dependency update commits');
};
