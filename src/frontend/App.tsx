import { Card, CardContent } from '@/frontend/components/ui/card';
import { APITester } from './APITester';
import './index.css';

export function App() {
  return (
    <div className='container mx-auto p-8 text-center relative z-10'>
      <Card className='bg-card/50 backdrop-blur-sm border-muted'>
        <CardContent className='pt-6'>
          <h1 className='text-5xl font-bold my-4 leading-tight'>Bun + React</h1>
          <p>
            Edit{' '}
            <code className='relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm'>
              src/App.tsx
            </code>{' '}
            and save to test HMR
          </p>
          <APITester />
        </CardContent>
      </Card>
    </div>
  );
}

export default App;
