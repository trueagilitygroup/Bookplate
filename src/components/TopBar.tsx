import type { Stage } from '../types';

interface Props {
  stage: Stage;
  readout: string;
  onReset?: () => void;
}

export function TopBar({ stage, readout, onReset }: Props) {
  return (
    <header className="bar">
      <div className="mark" aria-hidden="true"><span>凸</span></div>
      <div className="bar__id">
        <span className="bar__name">Bookplate</span>
        <span className="bar__sub">實體書 → 電子書</span>
      </div>
      <div className="bar__right">
        <span className="readout" dangerouslySetInnerHTML={{ __html: readout }} />
        {stage === 'read' && onReset && (
          <button className="btn btn--ghost" onClick={onReset}>掃下一批</button>
        )}
      </div>
    </header>
  );
}
