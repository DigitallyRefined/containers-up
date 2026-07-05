export const encodeBase64CommitMessage = (
  subject: string,
  body?: string,
  maxBase64Bytes = 75 * 1024
): string => {
  const ellipsis = '...';
  const ellipsisBytes = Buffer.byteLength(ellipsis, 'utf8');
  const newlineBytes = Buffer.byteLength('\n\n', 'utf8');

  const maxRawBytes = Math.floor((maxBase64Bytes * 3) / 4);

  const subjectBytes = Buffer.byteLength(subject || '', 'utf8');
  // Remove any Signed-off-by lines from the body
  const sanitizedBody = body
    ? body
        .split('\n')
        .filter((line) => line.trim() !== '')
        .filter((line) => !/^\s*(Signed-off-by|Co-authored-by):/i.test(line))
        .join('\n')
    : undefined;

  const bodyBytes = sanitizedBody ? Buffer.byteLength(sanitizedBody, 'utf8') : 0;

  // If whole message fits, return it
  if (subjectBytes + (sanitizedBody ? newlineBytes + bodyBytes : 0) <= maxRawBytes) {
    const full = sanitizedBody ? `${subject}\n\n${sanitizedBody}` : subject;
    return Buffer.from(full, 'utf8').toString('base64');
  }

  // Try keeping subject intact and truncate body first
  const availableForBody = Math.max(0, maxRawBytes - subjectBytes - newlineBytes - ellipsisBytes);

  if (availableForBody > 0 && sanitizedBody) {
    let bytesCount = 0;
    let cutIndex = 0;
    for (let i = 0; i < sanitizedBody.length; i++) {
      const ch = sanitizedBody.charAt(i);
      const chBytes = Buffer.byteLength(ch, 'utf8');
      if (bytesCount + chBytes > availableForBody) break;
      bytesCount += chBytes;
      cutIndex = i + 1;
    }
    const truncatedBody = sanitizedBody.slice(0, cutIndex) + ellipsis;
    return Buffer.from(`${subject}\n\n${truncatedBody}`, 'utf8').toString('base64');
  }

  // Not enough room for body; truncate subject instead (keep ellipsis)
  const availableForSubject = Math.max(0, maxRawBytes - ellipsisBytes);
  let bytesCount = 0;
  let cutIndex = 0;
  for (let i = 0; i < subject.length; i++) {
    const ch = subject.charAt(i);
    const chBytes = Buffer.byteLength(ch, 'utf8');
    if (bytesCount + chBytes > availableForSubject) break;
    bytesCount += chBytes;
    cutIndex = i + 1;
  }
  const truncatedSubject = subject.slice(0, cutIndex) + ellipsis;
  return Buffer.from(truncatedSubject, 'utf8').toString('base64');
};
