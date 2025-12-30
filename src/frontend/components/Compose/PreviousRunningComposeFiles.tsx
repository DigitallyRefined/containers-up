import { BrushCleaning, Play } from 'lucide-react';
import { useEffect } from 'react';
import type { ContainersResponse } from '@/frontend/components/Layout';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/frontend/components/ui/Accordion';
import { StreamingDialog } from '@/frontend/components/ui/StreamingDialog';
import { useLocalStorage } from '@/frontend/hooks/useLocalStorage';
import { getFolderName } from '@/frontend/lib/utils';

const getRunningComposedFolders = (
  composedContainers?: ContainersResponse['composedContainers'],
  otherComposedContainers?: ContainersResponse['otherComposedContainers']
) => {
  const composedFiles = Object.keys(composedContainers || {});
  const otherComposedFiles = Object.keys(otherComposedContainers || {});
  return [...composedFiles, ...otherComposedFiles].map(getFolderName);
};

export const PreviousRunningComposeFiles = ({
  selectedHost,
  composedContainers,
  otherComposedContainers,
}: {
  selectedHost: string;
  composedContainers: ContainersResponse['composedContainers'];
  otherComposedContainers: ContainersResponse['otherComposedContainers'];
}) => {
  const [seenComposedFolders, setSeenComposedFolders, removeSeenComposedFolder] = useLocalStorage<
    string[]
  >(`seenComposedFolders`, selectedHost, [], 'append');

  useEffect(() => {
    const newSeenComposedFolders = getRunningComposedFolders(
      composedContainers,
      otherComposedContainers
    );
    setSeenComposedFolders(newSeenComposedFolders);
  }, [selectedHost, composedContainers, otherComposedContainers]);

  const runningComposedFolders = getRunningComposedFolders(
    composedContainers,
    otherComposedContainers
  );
  const previousRunningComposedFolders = seenComposedFolders.filter(
    (folder) => !runningComposedFolders.includes(folder)
  );

  if (previousRunningComposedFolders?.length === 0) return null;

  return (
    <AccordionItem value="previousRunningComposedFiles">
      <AccordionTrigger>Previously Running Composed Files</AccordionTrigger>
      <AccordionContent>
        <ul className="mb-4">
          {previousRunningComposedFolders.map((composeFolder) => (
            <li key={composeFolder} className="pl-7">
              <StreamingDialog
                url={`/api/host/${selectedHost}/compose`}
                method="POST"
                body={{ composeFolder }}
                dialogTitle={`Run Compose File: ${composeFolder}`}
              >
                <a href="#" className="text-sm flex items-center gap-1 hover:underline">
                  <Play className="size-4" style={{ minWidth: '1rem' }} />
                  <BrushCleaning
                    onClick={(e) => {
                      e.preventDefault();
                      removeSeenComposedFolder(composeFolder);
                    }}
                    className="size-4"
                    style={{ minWidth: '1rem' }}
                  />
                  <span className="text-sm">{composeFolder}</span>
                </a>
              </StreamingDialog>
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
};
