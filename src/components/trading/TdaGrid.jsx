import { memo } from 'react';
import TdaBlock from './TdaBlock';

function TdaGrid({ blocks, onSave }) {
  return (
    <div className="grid w-full grid-cols-1 items-start gap-4 xl:grid-cols-2">
      {blocks.map((b) => (
        <TdaBlock
          key={b.id}
          id={b.id}
          tf={b.tf}
          image={b.image}
          text={b.text}
          isDimmed={b.isDimmed}
          onSave={onSave}
        />
      ))}
    </div>
  );
}

export default memo(TdaGrid);
