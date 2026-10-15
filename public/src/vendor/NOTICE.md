# OCR browser dependencies

The local file `tesseract-6.0.1.min.js` is the unmodified browser distribution from
https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js
SHA-256: `10fff78484067759c43028a02a72d76d0b90eb17302bb23b58a9ec5410bc928b`

Tesseract.js is Apache-2.0 licensed; its full upstream license accompanies this file
as `tesseract-6.0.1.LICENSE.md`. The generated bundled license notice is preserved
in `tesseract-6.0.1.min.js.LICENSE.txt`. Regenerator Runtime's MIT license is below.

OCR loads the following version-pinned dependencies on demand from jsDelivr:

- Tesseract.js worker 6.0.1 (Apache-2.0): https://github.com/naptha/tesseract.js
- Tesseract.js-core 6.0.0 (Apache-2.0): https://github.com/naptha/tesseract.js-core
- Tesseract Korean/English fast language data, tag 4.1.0 (Apache-2.0): https://github.com/tesseract-ocr/tessdata_fast
- PDF.js 5.4.296 (Apache-2.0): https://github.com/mozilla/pdf.js

Only engine, font, and language assets are downloaded. User files and OCR text
are processed in the user's browser, not submitted to the CDN.

## Regenerator Runtime

MIT License

Copyright (c) 2014-present, Facebook, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
