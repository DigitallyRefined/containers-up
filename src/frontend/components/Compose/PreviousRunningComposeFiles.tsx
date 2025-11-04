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

const getRunningComposedFiles = (
  composedContainers?: ContainersResponse['composedContainers'],
  otherComposedContainers?: ContainersResponse['otherComposedContainers']
) => {
  const composedFiles = Object.keys(composedContainers || {});
  const otherComposedFiles = Object.keys(otherComposedContainers || {});
  return [...composedFiles, ...otherComposedFiles];
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
  const [seenComposedFiles, setSeenComposedFiles, removeSeenComposedFile] = useLocalStorage<
    string[]
  >(`seenComposedFiles`, selectedHost, [], 'append');

  useEffect(() => {
    const newSeenComposedFiles = getRunningComposedFiles(
      composedContainers,
      otherComposedContainers
    );
    setSeenComposedFiles(newSeenComposedFiles);
  }, [selectedHost, composedContainers, otherComposedContainers]);

  const runningComposedFiles = getRunningComposedFiles(composedContainers, otherComposedContainers);
  const previousRunningComposedFiles = seenComposedFiles.filter(
    (file) => !runningComposedFiles.includes(file)
  );

  if (previousRunningComposedFiles?.length === 0) return null;

  return (
    <AccordionItem value="previousRunningComposedFiles">
      <AccordionTrigger>Previously Running Composed Files</AccordionTrigger>
      <AccordionContent>
        <ul className="mb-4">
          {previousRunningComposedFiles.map((file, idx) => (
            <li key={file} className="pl-7">
              <StreamingDialog
                url={`/api/host/${selectedHost}/compose`}
                method="POST"
                body={{ composeFile: file }}
                dialogTitle={`Run Compose File: ${file}`}
              >
                <a href="#" className="text-sm flex items-center gap-1 hover:underline">
                  <Play className="size-4" style={{ minWidth: '1rem' }} />
                  <BrushCleaning
                    onClick={(e) => {
                      e.preventDefault();
                      removeSeenComposedFile(file);
                    }}
                    className="size-4"
                    style={{ minWidth: '1rem' }}
                  />
                  <span className="text-sm">{file}</span>
                </a>
              </StreamingDialog>
            </li>
          ))}
        </ul>
      </AccordionContent>
    </AccordionItem>
  );
};
