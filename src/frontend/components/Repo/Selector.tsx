import { useEffect } from 'react';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../ui/select';
import type { Repo } from '@/backend/db/schema/repo';

interface RepoSelectorProps {
  selected: string | undefined;
  setSelected: (value: string | undefined) => void;
  repos: Repo[];
  refreshRepos: () => void;
}

export const RepoSelector = ({ selected, setSelected, repos, refreshRepos }: RepoSelectorProps) => {
  useEffect(() => {
    if (selected && selected !== 'add') {
      localStorage.setItem('selectedRepo', selected);
    }
  }, [selected]);

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
