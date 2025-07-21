import type { Log } from '@/backend/db/schema/log';

const getLogLevelInfo = (level: number) => {
  if (level >= 50) {
    return { color: 'bg-red-100 text-red-800', label: 'ERROR' };
  } else if (level >= 40) {
    return { color: 'bg-orange-100 text-orange-800', label: 'WARN' };
  } else if (level >= 30) {
    return { color: 'bg-yellow-100 text-yellow-800', label: 'INFO' };
  } else {
    return { color: 'bg-blue-50 text-blue-600', label: 'DEBUG' };
  }
};

export const Logs = ({ log }: { log: Log }) => {
  const logLevelInfo = getLogLevelInfo(log.level);
  return (
    <div className='text-xs p-2 rounded bg-muted'>
      <div className='flex justify-between items-start mb-1'>
        <span className='text-muted-foreground'>{new Date(`${log.time}Z`).toLocaleString()}</span>
        <span className={`px-1 py-0.5 rounded text-xs ${logLevelInfo.color}`}>
          {logLevelInfo.label}
        </span>
      </div>
      <pre className='whitespace-pre-wrap text-left break-words'>{log.msg}</pre>
    </div>
  );
};
