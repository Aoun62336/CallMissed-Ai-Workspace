import { FormEvent, useEffect, useState } from 'react';
import { api, errorText } from '../../lib/api';
import { DownloadIcon, ImageIcon } from '../../lib/icons';

type ImageResponse = { image: string; mime: string; image_bytes: number; elapsed_ms: number };

export function ImagesPage() {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [usedPrompt, setUsedPrompt] = useState('');
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [bytes, setBytes] = useState<number | null>(null);
  const remaining = 1000 - prompt.length;

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  function decodeBase64(value: string, mime: string): Blob {
    const binary = atob(value);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) buffer[i] = binary.charCodeAt(i);
    return new Blob([buffer], { type: mime });
  }

  async function generate(event: FormEvent) {
    event.preventDefault();
    const clean = prompt.trim();
    if (!clean || busy) return;
    setBusy(true); setError('');
    try {
      const result = await api<ImageResponse>('/api/images', {
        method: 'POST', body: JSON.stringify({ prompt: clean }),
      });
      const blob = decodeBase64(result.image, result.mime);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageBlob(blob);
      setImageUrl(URL.createObjectURL(blob));
      setUsedPrompt(clean);
      setElapsed(result.elapsed_ms);
      setBytes(result.image_bytes);
    } catch (reason) {
      // Keep the prompt and prior successful image if a later request fails.
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!imageBlob || !imageUrl) return;
    const extension = imageBlob.type === 'image/jpeg' ? 'jpg' : 'png';
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `callmissed-generated-image.${extension}`;
    link.click();
  }

  return <>
    <div className="page-title"><div><h1>Images</h1><p className="sub">Turn a description into one generated image.</p></div></div>
    <div className="image-grid">
      <form className="panel prompt" onSubmit={generate}>
        <h2>Create an image</h2><p className="sub">Describe the subject, setting and style you want.</p>
        {error && <div className="inline-error" role="alert">{error}</div>}
        <label className="field-label field-space" htmlFor="image-prompt">Image prompt</label>
        <textarea id="image-prompt" value={prompt} maxLength={1000} onChange={event => setPrompt(event.target.value)} placeholder="A small green tree on a plain white background." aria-describedby="image-help" disabled={busy}/>
        <p className="hint" id="image-help">One 1024×1024 image per request · {remaining.toLocaleString()} characters left.</p>
        <button className="btn primary" disabled={busy || !prompt.trim()}>{busy ? <><span className="spinner"/>Generating…</> : <><ImageIcon/>Generate image</>}</button>
      </form>

      <section className="panel preview" aria-live="polite">
        <div className="panel-title"><h2>Image preview</h2>{imageUrl && <span className="tag">Generated</span>}</div>
        {busy && !imageUrl ? <div className="image-empty generating"><span className="spinner large"/><h3>Creating your image</h3><p>This can take several seconds.</p></div> : imageUrl ? <>
          <img src={imageUrl} alt={usedPrompt ? `Generated image: ${usedPrompt}` : 'Generated image'}/>
          <p className="caption"><strong>Prompt:</strong> {usedPrompt}</p>
          {(elapsed !== null || bytes !== null) && <p className="measured block">{elapsed !== null ? `Generated in ${(elapsed / 1000).toFixed(2)} s` : ''}{elapsed !== null && bytes !== null ? ' · ' : ''}{bytes !== null ? `${Math.max(1, Math.round(bytes / 1024)).toLocaleString()} KB decoded` : ''}</p>}
          <button className="btn" onClick={download}><DownloadIcon/>Download image</button>
        </> : <div className="image-empty"><div className="placeholder-icon"><ImageIcon/></div><h3>Your image will appear here</h3><p>Enter a prompt and select Generate image.</p></div>}
      </section>
    </div>
    <p className="privacy">Prompts are sent to CallMissed for generation. Generated previews are kept only in this browser view and are not saved by this application.</p>
  </>;
}
