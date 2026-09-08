import type { Heading } from '../lib/markdown';

interface Props {
  headings: Heading[];
  activeId: string | null;
}

export function Toc({ headings, activeId }: Props) {
  return (
    <aside className="toc">
      <h3>目錄</h3>
      {headings.length === 0 ? (
        <p className="toc__none">這批頁面沒有辨識到標題。可以在「編輯原文」裡自己加上 # 標題。</p>
      ) : (
        <nav>
          {headings.map((h) => (
            <a
              key={h.id}
              href={'#' + h.id}
              className={'toc__l' + h.level + (activeId === h.id ? ' is-active' : '')}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            >
              {h.text}
            </a>
          ))}
        </nav>
      )}
    </aside>
  );
}
