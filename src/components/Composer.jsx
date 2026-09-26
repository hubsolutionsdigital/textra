import { useEffect, useRef, useState } from 'react';
import { KINDS, POSITIVE_KINDS } from '../guidance.js';

const MAX_IMAGES = 6;

/**
 * Popover that appears where the client clicked. It leads with positive presets
 * (love / like / great) and only then offers "suggest a change" or a question.
 */
export default function Composer({ onSubmit, onCancel, flip }) {
  const [kind, setKind] = useState(null);
  const [body, setBody] = useState('');
  const [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef(null);
  const needsText = kind === 'change' || kind === 'question';

  useEffect(() => {
    if (kind) textRef.current?.focus();
  }, [kind]);

  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.preview)), []);

  const addFiles = (files) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return false;
    setImages((cur) =>
      [...cur, ...imgs.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_IMAGES),
    );
    if (!kind) setKind('change');
    return true;
  };

  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items ?? [])]
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (addFiles(files)) e.preventDefault();
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!kind) return;
    if (needsText && !body.trim() && !images.length) {
      setError('Tell us a bit more so we can get it right.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ kind, body: body.trim(), images: images.map((i) => i.file) });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form
      className={`composer ${flip ? 'flip' : ''}`}
      onSubmit={submit}
      onPaste={onPaste}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel();
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e);
      }}
    >
      <div className="composer-title">{kind ? 'Anything to add?' : 'What do you think of this part?'}</div>
      <div className="preset-row">
        {POSITIVE_KINDS.map((k) => (
          <button
            type="button"
            key={k}
            className={`preset positive ${kind === k ? 'active' : ''}`}
            onClick={() => setKind(k)}
          >
            <span className="preset-emoji">{KINDS[k].emoji}</span>
            {KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="preset-row">
        {['change', 'question'].map((k) => (
          <button
            type="button"
            key={k}
            className={`preset ${KINDS[k].tone} ${kind === k ? 'active' : ''}`}
            onClick={() => setKind(k)}
          >
            <span className="preset-emoji">{KINDS[k].emoji}</span>
            {KINDS[k].label}
          </button>
        ))}
      </div>

      {kind && (
        <>
          <textarea
            ref={textRef}
            rows={needsText ? 4 : 2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              kind === 'change'
                ? 'What would you like changed? e.g. “Replace the slider with one big image”'
                : kind === 'question'
                  ? 'What would you like to know?'
                  : 'Optional — tell us what you like about it'
            }
          />
          {images.length > 0 && (
            <div className="composer-images">
              {images.map((img, i) => (
                <div key={img.preview} className="thumb">
                  <img src={img.preview} alt="" />
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => {
                      URL.revokeObjectURL(img.preview);
                      setImages((cur) => cur.filter((_, j) => j !== i));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-hint">
            📋 Paste a screenshot with <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd> or{' '}
            <label className="link-btn">
              attach an image
              <input type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            </label>
          </div>
        </>
      )}
      {error && <div className="form-error">{error}</div>}
      <div className="composer-actions">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" disabled={!kind || busy}>
          {busy ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </form>
  );
}
