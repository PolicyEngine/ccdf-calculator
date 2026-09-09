import { Suspense } from 'react';
import Calculator from '@/components/Calculator';

export default function CalculatorPage() {
  return (
    <Suspense fallback={<div className="app"><div className="loading">Loading calculator…</div></div>}>
      <Calculator />
    </Suspense>
  );
}
