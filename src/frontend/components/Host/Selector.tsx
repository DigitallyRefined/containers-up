import type { Host } from '@/backend/db/schema/host';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/Select';

interface HostSelectorProps {
  selected: string | undefined;
  setSelected: (value: string | undefined) => void;
  hosts: Host[];
}

export const HostSelector = ({ selected, setSelected, hosts }: HostSelectorProps) => {
  return (
    <Select value={selected || ''} onValueChange={setSelected}>
      <SelectTrigger>
        <SelectValue placeholder="Select or add a host..." />
      </SelectTrigger>
      <SelectContent>
        {hosts.map((host) => (
          <SelectItem key={host.name} value={host.name}>
            {host.name}
          </SelectItem>
        ))}
        <SelectItem key="add" value="add">
          Add a new host...
        </SelectItem>
      </SelectContent>
    </Select>
  );
};
