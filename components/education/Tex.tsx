'use client';

import { useMemo } from 'react';
import katex from 'katex';

/** KaTeX-rendered math. `display` renders a centered block. */
export default function Tex({ children, display = false, className }: { children: string; display?: boolean; className?: string }) {
  const html = useMemo(
    () => katex.renderToString(children, { displayMode: display, throwOnError: false, strict: 'ignore', output: 'html' }),
    [children, display],
  );
  const Tag = display ? 'div' : 'span';
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
