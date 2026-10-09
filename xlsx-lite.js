// ==================================================================
// xlsx-lite.js — كاتب إكسل خفيف بدون مكتبات خارجية
// يدعم: ورقة واحدة من اليمين لليسار، عناوين ملوّنة، روابط، وصور مدمجة بخلايا
//
// const blob = await buildXlsx({
//   sheetName, columns: [{ header, width }],
//   sheets: [{ name, columns, rows, rowHeight }]  ← عدة أوراق (أو sheetName/columns/rows لورقة وحدة)
//   rows: [{ cells: [value | { text, link }], image?: { col, data: Uint8Array, w, h }, height?, total? }],
//   rowHeight,  // نقطة
// });
// ==================================================================

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function xmlEsc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function colName(i) {
  let s = "";
  i += 1;
  while (i > 0) {
    const m = (i - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    i = Math.floor((i - 1) / 26);
  }
  return s;
}

// ---------------------------------------------------------------
// ZIP (ضغط deflate عند توفّره بالمتصفح، وإلا تخزين بدون ضغط)
// ---------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate-raw");
    const out = await new Response(new Blob([bytes]).stream().pipeThrough(cs)).arrayBuffer();
    return new Uint8Array(out);
  } catch (e) {
    return null;
  }
}

async function buildZip(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    // الصور JPEG مضغوطة أصلًا، فنخزنها كما هي
    const deflated = f.store ? null : await deflateRaw(data);
    const useDeflate = deflated && deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // أسماء UTF-8
    lh.setUint16(8, method, true);
    lh.setUint16(10, 0, true);
    lh.setUint16(12, 0x21, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), name, body);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, method, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);

    offset += 30 + name.length + body.length;
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: XLSX_MIME });
}

// ---------------------------------------------------------------
// بناء ملف الإكسل
// ---------------------------------------------------------------
const EMU_PER_PX = 9525;

// أجزاء ورقة وحدة. n = رقم الورقة، imgStart = أول رقم صورة بالملف
function buildSheetParts({ columns, rows, rowHeight = 18 }, n, imgStart) {
  const hyperlinks = [];
  const images = [];
  const rowXml = [];

  // صف العناوين
  rowXml.push(
    `<row r="1" ht="24" customHeight="1">${columns
      .map((c, i) => `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t>${xmlEsc(c.header)}</t></is></c>`)
      .join("")}</row>`
  );

  rows.forEach((row, ri) => {
    const r = ri + 2;
    const st = row.total ? 4 : 2; // صف المجاميع: عريض بخلفية فاتحة
    const cells = row.cells.map((v, ci) => {
      const ref = `${colName(ci)}${r}`;
      if (v && typeof v === "object" && v.link) {
        hyperlinks.push({ ref, link: v.link });
        return `<c r="${ref}" s="3" t="inlineStr"><is><t>${xmlEsc(v.text)}</t></is></c>`;
      }
      if (typeof v === "number") return `<c r="${ref}" s="${st}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${st}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v ?? "")}</t></is></c>`;
    });
    rowXml.push(`<row r="${r}" ht="${row.height || rowHeight}" customHeight="1">${cells.join("")}</row>`);
    if (row.image) images.push({ ...row.image, row: r - 1 });
  });

  const lastRef = `${colName(columns.length - 1)}${rows.length + 1}`;
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews><sheetView rightToLeft="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="18"/>` +
    `<cols>${columns.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width || 14}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${rowXml.join("")}</sheetData>` +
    (hyperlinks.length ? `<hyperlinks>${hyperlinks.map((h, i) => `<hyperlink ref="${h.ref}" r:id="rIdH${i + 1}"/>`).join("")}</hyperlinks>` : "") +
    `<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>` +
    (images.length ? `<drawing r:id="rIdD1"/>` : "") +
    `</worksheet>`;

  const sheetRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    hyperlinks.map((h, i) => `<Relationship Id="rIdH${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEsc(h.link)}" TargetMode="External"/>`).join("") +
    (images.length ? `<Relationship Id="rIdD1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/>` : "") +
    `</Relationships>`;

  const drawingXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    images.map((im, i) =>
      `<xdr:oneCellAnchor>` +
        `<xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>${Math.round((im.offX || 0) * EMU_PER_PX)}</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>${Math.round((im.offY || 0) * EMU_PER_PX)}</xdr:rowOff></xdr:from>` +
        `<xdr:ext cx="${Math.round(im.w * EMU_PER_PX)}" cy="${Math.round(im.h * EMU_PER_PX)}"/>` +
        `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="صورة ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="rIdI${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(im.w * EMU_PER_PX)}" cy="${Math.round(im.h * EMU_PER_PX)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>` +
        `<xdr:clientData/>` +
      `</xdr:oneCellAnchor>`
    ).join("") +
    `</xdr:wsDr>`;

  const drawingRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    images.map((im, i) => `<Relationship Id="rIdI${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imgStart + i + 1}.jpeg"/>`).join("") +
    `</Relationships>`;

  return { sheetXml, sheetRels, drawingXml, drawingRels, images };
}

// sheets: [{ name, columns, rows, rowHeight }] — أو ورقة وحدة بالشكل القديم
async function buildXlsx({ sheets = null, sheetName = "Sheet1", columns, rows, rowHeight = 18, headerColor = "FF126151" }) {
  const list = sheets || [{ name: sheetName, columns, rows, rowHeight }];
  let imgCount = 0;
  const parts = list.map((sh, i) => {
    const p = buildSheetParts(sh, i + 1, imgCount);
    imgCount += p.images.length;
    return p;
  });
  // أسماء الأوراق: 31 حرف بدون رموز ممنوعة، وبدون تكرار
  const used = new Set();
  const names = list.map((sh, i) => {
    let base = String(sh.name || `ورقة ${i + 1}`).replace(/[\[\]:*?\/\\]/g, " ").trim().slice(0, 31) || `ورقة ${i + 1}`;
    let name = base, k = 2;
    while (used.has(name)) name = `${base.slice(0, 27)} (${k++})`;
    used.add(name);
    return name;
  });

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="4">` +
      `<font><sz val="11"/><name val="Arial"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>` +
      `<font><u/><sz val="11"/><color rgb="FF0563C1"/><name val="Arial"/></font>` +
      `<font><b/><sz val="11"/><color rgb="FF0D4C3F"/><name val="Arial"/></font>` +
    `</fonts>` +
    `<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="${headerColor}"/><bgColor indexed="64"/></patternFill></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFE4F1ED"/><bgColor indexed="64"/></patternFill></fill></fills>` +
    `<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>` +
      `<border><left style="thin"><color rgb="FFD2DAD7"/></left><right style="thin"><color rgb="FFD2DAD7"/></right><top style="thin"><color rgb="FFD2DAD7"/></top><bottom style="thin"><color rgb="FFD2DAD7"/></bottom><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="5">` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
      `<xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` +
      `<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const files = [
    {
      name: "[Content_Types].xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Default Extension="jpeg" ContentType="image/jpeg"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        parts.map((p, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        parts.map((p, i) => (p.images.length ? `<Override PartName="/xl/drawings/drawing${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>` : "")).join("") +
        `</Types>`,
    },
    {
      name: "_rels/.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
        `</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        `<bookViews><workbookView/></bookViews>` +
        `<sheets>${names.map((nm, i) => `<sheet name="${xmlEsc(nm)}" sheetId="${i + 1}" r:id="rIdS${i + 1}"/>`).join("")}</sheets>` +
        `</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data:
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        parts.map((p, i) => `<Relationship Id="rIdS${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
        `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        `</Relationships>`,
    },
    { name: "xl/styles.xml", data: stylesXml },
  ];
  let img = 0;
  parts.forEach((p, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: p.sheetXml });
    files.push({ name: `xl/worksheets/_rels/sheet${i + 1}.xml.rels`, data: p.sheetRels });
    if (p.images.length) {
      files.push({ name: `xl/drawings/drawing${i + 1}.xml`, data: p.drawingXml });
      files.push({ name: `xl/drawings/_rels/drawing${i + 1}.xml.rels`, data: p.drawingRels });
      p.images.forEach((im) => files.push({ name: `xl/media/image${++img}.jpeg`, data: im.data, store: true }));
    }
  });
  return buildZip(files);
}
