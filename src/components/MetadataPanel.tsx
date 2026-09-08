import { useState } from 'react';
import { imprintLine } from '../lib/metadata';
import type { BookMetadata } from '../types';

interface Props {
  metadata: BookMetadata;
  sourcePages: number;
  onChange: (patch: Partial<BookMetadata>) => void;
}

const TEXT_FIELDS: { key: keyof BookMetadata; label: string; placeholder: string }[] = [
  { key: 'subtitle', label: '副標題', placeholder: '未偵測到' },
  { key: 'publisher', label: '出版社', placeholder: '未偵測到' },
  { key: 'year', label: '出版年', placeholder: '西元年' },
  { key: 'edition', label: '版次', placeholder: '如：初版' },
  { key: 'isbn', label: 'ISBN', placeholder: '未偵測到' },
  { key: 'series', label: '叢書', placeholder: '未偵測到' },
  { key: 'originalTitle', label: '原文書名', placeholder: '翻譯書才有' },
];

export function MetadataPanel({ metadata, sourcePages, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const imprint = imprintLine(metadata);

  return (
    <section className="panel">
      <h3>出版資訊</h3>

      {sourcePages > 0 ? (
        <p className="panel__lead">
          從 {sourcePages} 張封面／版權頁抓到的。這些頁面的文字不會混進正文。
        </p>
      ) : (
        <p className="panel__lead">
          這批照片裡沒有封面或版權頁。可以自己填，或下次把封面一起拍進來。
        </p>
      )}

      {imprint && !open && <p className="imprint">{imprint}</p>}

      <button className="disclose disclose--light" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? '收合欄位 −' : '檢視與修改 +'}
      </button>

      {open && (
        <div className="meta__fields">
          <label className="mf">
            <span>作者</span>
            <input
              value={metadata.authors.join('、')}
              placeholder="多位以頓號分隔"
              onChange={(e) => onChange({ authors: e.target.value.split(/[、,，]/).map((v) => v.trim()).filter(Boolean) })}
            />
          </label>
          <label className="mf">
            <span>譯者</span>
            <input
              value={metadata.translators.join('、')}
              placeholder="翻譯書才有"
              onChange={(e) => onChange({ translators: e.target.value.split(/[、,，]/).map((v) => v.trim()).filter(Boolean) })}
            />
          </label>
          {TEXT_FIELDS.map((f) => (
            <label className="mf" key={f.key}>
              <span>{f.label}</span>
              <input
                value={(metadata[f.key] as string | null) ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => onChange({ [f.key]: e.target.value.trim() || null } as Partial<BookMetadata>)}
              />
            </label>
          ))}
          <p className="mf__note">這些欄位會寫進 Markdown front matter、EPUB 書目資料與 Word／PDF 的書名頁。</p>
        </div>
      )}
    </section>
  );
}
