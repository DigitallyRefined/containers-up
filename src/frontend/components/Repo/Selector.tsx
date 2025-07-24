import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/frontend/components/ui/Select';
import type { Repo } from '@/backend/db/schema/repo';

interface RepoSelectorProps {
  selected: string | undefined;
  setSelected: (value: string | undefined) => void;
  repos: Repo[];
}

export const RepoSelector = ({ selected, setSelected, repos }: RepoSelectorProps) => {
  return (
    <Select value={selected || ''} onValueChange={setSelected}>
      <SelectTrigger>
        <SelectValue placeholder='Select or add a repo...' />
      </SelectTrigger>
      <SelectContent>
        {repos.map((repo) => (
          <SelectItem key={repo.name} value={repo.name}>
            {repo.name}
          </SelectItem>
        ))}
        <SelectItem key='add' value='add'>
          Add a new repo...
        </SelectItem>
      </SelectContent>
    </Select>
  );
};
