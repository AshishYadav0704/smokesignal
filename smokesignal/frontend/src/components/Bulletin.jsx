import { useState } from 'react';

export default function Bulletin({ bulletin }) {
  const [lang, setLang] = useState('en');
  const [copied, setCopied] = useState(false);
  if (!bulletin) return null;
  const text = bulletin[lang];

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="bulletin">
      <div className="bulletin-head">
        <h2>Bulletin to share</h2>
        <div className="toggle" role="group" aria-label="Bulletin language">
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} lang="hi">हिंदी</button>
        </div>
      </div>
      <p className="bulletin-text" lang={lang}>{text}</p>
      <div className="bulletin-foot">
        <button type="button" className="btn-quiet" onClick={copy}>{copied ? 'Copied' : 'Copy bulletin'}</button>
        <span className="provenance">
          {bulletin.source === 'bedrock'
            ? `Written by Amazon Bedrock (${bulletin.model}) from the forecast numbers.`
            : 'Template text. Bedrock was unavailable for this run.'}
        </span>
      </div>
    </section>
  );
}
