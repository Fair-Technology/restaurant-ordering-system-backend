declare module 'subset-font' {
  interface SubsetFontOptions {
    targetFormat?: 'sfnt' | 'woff' | 'woff2';
    preserveNameIds?: number[];
    noLayoutClosure?: boolean;
  }
  function subsetFont(font: Buffer, text: string, options?: SubsetFontOptions): Promise<Buffer>;
  export = subsetFont;
}
