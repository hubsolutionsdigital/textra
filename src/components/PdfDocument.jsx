import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

// Keep canvases under ~16MP so very tall UI mockups still render on mobile Safari.
const MAX_CANVAS_PIXELS = 16_000_000;

/**
 * Renders every page of a PDF stacked vertically, fitted to the container width × zoom.
 * `renderOverlay(pageNumber)` draws pins/popovers on top of each page; the overlay
 * box has the exact size of the rendered page so children can position with %.
 */
export default function PdfDocument({ url, zoom = 1, renderOverlay, onPageClick }) {
  const wrapRef = useRef(null);
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    setDoc(null);
    setError(null);
    const task = pdfjs.getDocument({ url, withCredentials: true });
    task.promise.then(setDoc, (err) => {
      if (err?.name !== 'AbortException') setError('We couldn’t open this PDF.');
    });
    return () => task.destroy();
  }, [url]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pageWidth = Math.max(240, Math.floor(width * zoom));

  return (
    <div className="pdf-doc" ref={wrapRef}>
      {error && <div className="pdf-status">{error}</div>}
      {!doc && !error && <div className="pdf-status">Loading design…</div>}
      {doc &&
        width > 0 &&
        Array.from({ length: doc.numPages }, (_, i) => (
          <PdfPage
            key={`${url}-${i}`}
            doc={doc}
            pageNumber={i + 1}
            width={pageWidth}
            renderOverlay={renderOverlay}
            onPageClick={onPageClick}
          />
        ))}
    </div>
  );
}

function PdfPage({ doc, pageNumber, width, renderOverlay, onPageClick }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [page, setPage] = useState(null);
  const [visible, setVisible] = useState(pageNumber === 1);

  useEffect(() => {
    let alive = true;
    doc.getPage(pageNumber).then((p) => alive && setPage(p));
    return () => {
      alive = false;
    };
  }, [doc, pageNumber]);

  // Only render pages near the viewport.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: '800px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const base = page?.getViewport({ scale: 1 });
  const cssScale = base ? width / base.width : 1;
  const height = base ? Math.round(base.height * cssScale) : Math.round(width * 1.3);

  useEffect(() => {
    if (!page || !visible || !canvasRef.current) return;
    const viewport = page.getViewport({ scale: cssScale });
    const dpr = window.devicePixelRatio || 1;
    const ratio = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / (viewport.width * viewport.height)));
    const canvas = canvasRef.current;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    const task = page.render({
      canvas,
      viewport: page.getViewport({ scale: cssScale * ratio }),
    });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [page, visible, cssScale]);

  const handleClick = (e) => {
    if (!onPageClick || e.target !== canvasRef.current) return;
    const rect = boxRef.current.getBoundingClientRect();
    onPageClick({
      pageNumber,
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    });
  };

  return (
    <div className="pdf-page" ref={boxRef} style={{ width, height }} onClick={handleClick}>
      <canvas ref={canvasRef} style={{ width, height }} />
      {page && renderOverlay?.(pageNumber)}
    </div>
  );
}
