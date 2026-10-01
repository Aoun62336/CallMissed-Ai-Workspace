import type { SVGProps } from 'react';

function IconBase(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props} />;
}

export function ChatIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M7 9h8M7 13h5"/></IconBase>;
}
export function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/></IconBase>;
}
export function MicIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M9 22h6"/></IconBase>;
}
export function CopyIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></IconBase>;
}
export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></IconBase>;
}
export function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M12 5v14M5 12h14"/></IconBase>;
}
export function SendIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></IconBase>;
}
export function StopIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><rect x="6" y="6" width="12" height="12" rx="2"/></IconBase>;
}
export function VolumeIcon(props: SVGProps<SVGSVGElement>) {
  return <IconBase {...props}><path d="M11 5 6 9H2v6h4l5 4Z"/><path d="M15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12"/></IconBase>;
}
