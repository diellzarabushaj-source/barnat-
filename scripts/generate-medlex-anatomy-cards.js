#!/usr/bin/env node
'use strict';

// Reproducible educational card illustrations. The highlighted surface areas
// are schematic (not diagnostic boundaries). All labels come from the reviewed
// MedLex dataset; no generative model is used for anatomical localization.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');
const dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/medlex-anatomy.json'), 'utf8'));
const output = path.join(ROOT, 'assets/medlex-anatomy');
const columns = dictionary.schema;
const terms = dictionary.terms.map(values => Object.fromEntries(columns.map((name,i) => [name, values[i]])));
const e = value => String(value || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');

function wrapWords(value, length, maxLines=2) {
  const chunks=[];
  let line='';
  for(const word of String(value).split(/\s+/)) {
    if((line+' '+word).trim().length > length && line){chunks.push(line);line=word;}
    else line=(line+' '+word).trim();
  }
  if(line)chunks.push(line);
  if(chunks.length<=maxLines)return chunks;
  const kept=chunks.slice(0,maxLines-1);
  kept.push(chunks.slice(maxLines-1).join(' '));
  return kept;
}

function textLines(value, {x=627,y=0,size=46,color='#173e3d',maxChars=44,maxLines=2,spacing=1.16,weight=760}={}) {
  const lines=wrapWords(value,maxChars,maxLines);
  const actualSize=lines.some(line=>line.length>54)?Math.max(26,size-8):size;
  return '<text x="'+x+'" y="'+y+'" text-anchor="middle" fill="'+color+'" font-family="DejaVu Sans, Arial, sans-serif" font-size="'+actualSize+'" font-weight="'+weight+'">'+
    lines.map((line,i)=>'<tspan x="'+x+'" dy="'+(i===0?0:actualSize*spacing)+'">'+e(line)+'</tspan>').join('')+'</text>';
}

function doctor() {
  return `<g opacity=".98">
    <ellipse cx="234" cy="838" rx="194" ry="35" fill="#F1D6BE" opacity=".34"/>
    <path d="M82 806 Q75 670 153 636 L246 631 Q346 656 358 805Z" fill="#F7FEFF" stroke="#35656A" stroke-width="6"/>
    <path d="M166 639 L209 735 L250 631 L278 650 L256 806 L137 806Z" fill="#0B8A84"/>
    <path d="M160 638 L207 743 L177 807 L98 807 L120 684Z" fill="#FFFFFF" stroke="#D3E6E4" stroke-width="5"/>
    <path d="M252 640 L210 744 L239 807 L347 807 L321 681Z" fill="#F9FFFF" stroke="#D3E6E4" stroke-width="5"/>
    <path d="M118 530 Q99 437 157 399 Q212 366 281 412 Q333 453 313 535 L306 617 Q279 656 211 660 Q148 651 126 608Z" fill="#513027" stroke="#392924" stroke-width="9"/>
    <ellipse cx="219" cy="522" rx="96" ry="115" fill="#F6BF9F" stroke="#824D3C" stroke-width="5"/>
    <path d="M127 486 Q129 397 218 389 Q311 393 315 491 Q273 471 250 438 Q196 488 129 479Z" fill="#543025"/>
    <path d="M152 482 Q140 432 172 411 Q117 432 117 485Z" fill="#41251F"/>
    <path d="M174 522 Q188 509 206 522" fill="none" stroke="#57332B" stroke-width="5" stroke-linecap="round"/>
    <path d="M235 522 Q251 508 265 520" fill="none" stroke="#57332B" stroke-width="5" stroke-linecap="round"/>
    <circle cx="192" cy="527" r="8" fill="#3F2F2B"/><circle cx="250" cy="527" r="8" fill="#3F2F2B"/>
    <path d="M223 532 L217 554 Q223 561 234 556" fill="none" stroke="#A77259" stroke-width="4"/>
    <path d="M188 580 Q220 607 253 577" fill="none" stroke="#9E493E" stroke-width="5" stroke-linecap="round"/>
    <path d="M305 722 Q349 687 386 646 L456 609" fill="none" stroke="#F1B58D" stroke-width="33" stroke-linecap="round"/>
    <path d="M447 615 L482 589 M452 616 L492 605" fill="none" stroke="#F1B58D" stroke-width="14" stroke-linecap="round"/>
    <path d="M160 664 Q155 737 185 751 Q199 758 210 748" fill="none" stroke="#446E78" stroke-width="8"/>
    <path d="M246 664 Q249 731 217 747" fill="none" stroke="#446E78" stroke-width="8"/>
    <circle cx="213" cy="750" r="17" fill="#D1E8E9" stroke="#456E77" stroke-width="7"/>
  </g>`;
}

const baseStroke='stroke="#477879" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"';
function anatomyBody(group) {
  const common=`<g fill="#F6C9A7" ${baseStroke}>`;
  if(group==='upper')return `${common}
    <path d="M190 74 Q218 45 244 54 Q289 53 305 97 L320 207 Q325 245 317 266 L328 397 Q340 414 335 435 L342 450 Q364 454 371 480 L367 512 Q356 521 349 506 L341 481 L339 521 Q327 533 320 515 L314 487 L311 523 Q296 536 287 516 L282 489 L274 510 Q259 516 252 496 L250 460 L265 422 L267 397 L258 285 L237 275 L216 213 L177 129 Q171 93 190 74Z"/>
    <path d="M405 71 Q436 49 463 68 Q491 83 487 126 L470 246 Q462 274 454 280 L467 399 L477 443 L486 480 L479 518 Q466 529 453 511 L443 479 L436 519 Q419 524 413 505 L408 466 L412 420 L396 289 L385 245 L382 126 Q382 89 405 71Z"/>
  </g><path d="M223 258 Q275 272 315 253 M395 258 Q440 278 468 255 M264 415 Q299 428 336 414 M414 414 Q444 430 474 416" fill="none" stroke="#D58E6C" stroke-width="5"/>`;
  if(group==='lower')return `${common}
    <path d="M168 66 Q275 26 379 66 L389 143 Q371 208 351 253 L348 298 L366 431 L369 478 L380 501 L377 518 L305 518 L303 490 L295 428 L283 319 L274 257 L262 319 L246 435 L246 485 L239 517 L170 517 L162 502 L174 470 L181 426 L190 300 L190 256 Q157 190 160 141Z"/>
    <path d="M278 117 Q278 145 278 173" fill="none" stroke="#D58E6C" stroke-width="4"/>
  </g><path d="M276 100 Q278 154 278 212 M177 282 L246 284 M304 284 L365 282 M177 445 Q210 455 245 443 M307 444 Q339 456 367 443" fill="none" stroke="#D58E6C" stroke-width="5"/>`;
  if(group==='head')return `${common}
    <ellipse cx="239" cy="263" rx="155" ry="207"/><ellipse cx="439" cy="267" rx="103" ry="179"/>
    <ellipse cx="92" cy="272" rx="25" ry="47"/><ellipse cx="338" cy="272" rx="24" ry="46"/>
  </g><g fill="none" stroke="#855A4B" stroke-width="5" stroke-linecap="round">
    <path d="M149 230 Q191 205 211 226 M251 228 Q283 209 314 230"/>
    <path d="M159 252 Q184 241 210 253 M255 252 Q283 242 304 253"/>
    <path d="M230 260 L218 310 L240 312 M190 352 Q235 372 272 347"/>
    <path d="M428 273 Q477 252 488 286 M483 294 Q480 331 456 356"/>
  </g>`;
  if(group==='neck')return `${common}
    <ellipse cx="255" cy="135" rx="108" ry="113"/>
    <path d="M203 220 L202 309 Q174 345 95 355 L95 496 L463 496 L460 355 Q341 343 318 313 L318 220Z"/>
  </g><path d="M202 308 Q252 339 313 309 M199 328 Q231 378 231 459 M316 328 Q293 380 293 457" fill="none" stroke="#D58E6C" stroke-width="5"/>`;
  if(group==='thorax')return `${common}
    <path d="M228 75 L333 75 Q390 100 459 133 L464 266 Q427 310 411 459 L155 459 Q140 314 97 266 L98 133 Q165 99 228 75Z"/>
    <path d="M239 62 L240 14 L327 14 L328 62Z"/>
  </g><path d="M280 113 L280 409 M145 181 Q215 143 269 194 M294 194 Q365 144 420 182" fill="none" stroke="#D58E6C" stroke-width="6"/>`;
  if(group==='back')return `${common}
    <path d="M226 69 L338 69 Q404 96 476 144 L447 297 L417 489 L142 489 L111 297 L85 145 Q165 98 226 69Z"/>
    <path d="M234 65 L237 20 L332 20 L332 65Z"/>
  </g><path d="M282 104 L282 476 M132 193 Q188 138 246 179 L237 298 Q181 302 132 250 M431 194 Q376 136 318 179 L326 298 Q384 302 431 253" fill="none" stroke="#D58E6C" stroke-width="6"/>`;
  if(group==='pelvis')return `${common}
    <path d="M140 114 Q282 27 432 116 L429 284 Q395 368 331 410 L321 492 L234 492 L225 411 Q160 365 132 284Z"/>
  </g><path d="M282 164 L282 460 M177 288 Q281 342 388 286" fill="none" stroke="#D58E6C" stroke-width="5"/>`;
  return `${common}<path d="M220 78 Q282 56 339 78 L437 151 L407 405 L158 405 L129 150Z"/></g>`;
}

function pin(x,y,label) {
  const cx=50+5.0*x, cy=30+4.75*y;
  return `<g><circle cx="${cx}" cy="${cy}" r="39" fill="#FF7455" opacity=".14"/>
    <circle cx="${cx}" cy="${cy}" r="27" fill="#FFF9EE" stroke="#F2543D" stroke-width="8"/>
    <circle cx="${cx}" cy="${cy}" r="12" fill="#F2543D"/>
    <path d="M${cx+34} ${cy-23} L${Math.min(560,cx+89)} ${cy-54}" fill="none" stroke="#C95A47" stroke-width="5" stroke-linecap="round"/>
  </g>`;
}

function abdomenGrid(index, quadrants=false) {
  const cols=quadrants?2:3, rows=quadrants?2:3;
  const x=97,y=63,width=380,height=395,cw=width/cols,ch=height/rows;
  let cells='';
  for(let i=0;i<cols*rows;i++){
    const cx=x+(i%cols)*cw,cy=y+Math.floor(i/cols)*ch;
    const active=i===index;
    cells+=`<rect x="${cx+3}" y="${cy+3}" width="${cw-6}" height="${ch-6}" rx="10" fill="${active?'#F85A42':'#E4F0EC'}" stroke="${active?'#D23B2B':'#9DC4BF'}" stroke-width="${active?5:2}"/>`;
  }
  return `<g><path d="M206 24 Q287 49 369 24 L478 96 Q479 247 430 461 L148 461 Q99 247 101 97Z" fill="#F6C9A7" stroke="#477879" stroke-width="8"/>${cells}
    <path d="M287 65 L287 459" stroke="#5B9C92" stroke-width="3" stroke-dasharray="9 9" opacity=".45"/>
    <circle cx="288" cy="260" r="13" fill="#DFA687" stroke="#7B5550" stroke-width="4"/>
  </g>`;
}

function directionArt(token) {
  const code=token.split(':')[1];
  const human=(x,shade)=>`<g transform="translate(${x} 44)" fill="${shade}" stroke="#477879" stroke-width="6"><circle cx="0" cy="63" r="48"/><path d="M-45 132 L45 132 L60 307 L36 307 L31 457 L8 457 L0 315 L-8 457 L-31 457 L-35 307 L-60 307Z"/></g>`;
  const horizontal=['lateral','medial','ipsilateral','contralateral','bilateral','unilateral','radial','ulnar','tibial','fibular'];
  const vertical=['superior','inferior','proximal','distal','cranial','caudal'];
  const double=['bilateral','contralateral','lateral'].includes(code);
  if (['bilateral','unilateral','ipsilateral','contralateral'].includes(code)) {
    const spots = code==='bilateral' ? [[208,216],[328,216]] : code==='unilateral' ? [[328,216]] :
      code==='ipsilateral' ? [[208,216],[208,335]] : [[208,216],[328,335]];
    return `${human(268,'#F6C9A7')}${spots.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="25" fill="#F2543D" stroke="#FFF9EF" stroke-width="7"/>`).join('')}`;
  }
  if(code==='supine'||code==='prone')return `<g transform="rotate(90 280 260)">${human(280,'#F6C9A7')}</g><path d="M90 443 L469 443" stroke="#4D8D87" stroke-width="9" stroke-linecap="round"/><text x="280" y="490" text-anchor="middle" fill="#23796E" font-size="32" font-weight="bold">${code.toUpperCase()}</text>`;
  if(code==='sagittal'||code==='coronal'||code==='transverse'||code==='median')return `${human(280,'#F6C9A7')}<path d="${code==='transverse'?'M86 290 L480 290':code==='coronal'?'M140 90 L422 438':'M281 29 L281 508'}" stroke="#F2543D" stroke-width="12" stroke-dasharray="20 14" stroke-linecap="round"/>`;
  const arrow=horizontal
    ?`<path d="M${double?100:280} 258 L${code==='medial'?175:double?450:420} 258" stroke="#F2543D" stroke-width="18" stroke-linecap="round"/><path d="M${code==='medial'?190:double?435:405} 238 L${code==='medial'?170:double?455:425} 258 L${code==='medial'?190:double?435:405} 278" fill="none" stroke="#F2543D" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>`
    :`<path d="M400 ${['inferior','distal','caudal'].includes(code)?100:440} L400 ${['inferior','distal','caudal'].includes(code)?440:100}" stroke="#F2543D" stroke-width="17" stroke-linecap="round"/><path d="M383 ${['inferior','distal','caudal'].includes(code)?425:115} L400 ${['inferior','distal','caudal'].includes(code)?447:92} L417 ${['inferior','distal','caudal'].includes(code)?425:115}" fill="none" stroke="#F2543D" stroke-width="15" stroke-linecap="round"/>`;
  return `${human(218,'#F6C9A7')}${arrow}`;
}

function layerArt(code) {
  if (['intraperitoneal','retroperitoneal','extraperitoneal'].includes(code)) {
    const cx = code==='intraperitoneal' ? 270 : code==='retroperitoneal' ? 397 : 145;
    return `<rect x="75" y="67" width="419" height="410" rx="66" fill="#F6C9A7" stroke="#477879" stroke-width="9"/>
      <ellipse cx="272" cy="253" rx="134" ry="167" fill="#FDEBDC" stroke="#A66D67" stroke-width="14" stroke-dasharray="17 9"/>
      <path d="M395 105 L436 105 L436 405 L394 405" fill="none" stroke="#CE8A63" stroke-width="6"/>
      <circle cx="${cx}" cy="243" r="36" fill="#F2543D" stroke="#FFF9EF" stroke-width="8"/>
      <text x="270" y="456" text-anchor="middle" font-size="26" font-weight="bold" fill="#25474B">PERITONEUM</text>`;
  }
  const levels=[['LËKURA','#F5B795'],['NËNLËKUROR','#F9DB88'],['MUSKUJT','#E9786D'],['THELLË','#AAB9C9']];
  return `<g transform="translate(82 112)">${levels.map((item,i)=>`<rect x="0" y="${i*91}" width="417" height="87" rx="13" fill="${item[1]}" stroke="#FFFFFF" stroke-width="4"/><text x="208" y="${i*91+55}" text-anchor="middle" font-size="29" font-weight="bold" fill="#25474B">${item[0]}</text>`).join('')}
    <path d="M${code==='superficial'?26:code==='subcutaneous'?40:code==='deep'?55:430} ${code==='superficial'?35:code==='subcutaneous'?138:code==='deep'?320:230} l60 0" stroke="#F2543D" stroke-width="15" stroke-linecap="round"/></g>`;
}

function art(term) {
  const [kind,...args]=term.visual.split(':');
  let diagram='';
  if(kind==='abdomen'||kind==='quadrant')diagram=abdomenGrid(Number(args[0]),kind==='quadrant');
  else if(kind==='direction')diagram=directionArt(term.visual);
  else if(kind==='layers')diagram=layerArt(args[0]);
  else diagram=anatomyBody(kind)+pin(Number(args[0]),Number(args[1]),term.term);
  return `<g transform="translate(628 344)">
    <rect x="18" y="12" width="557" height="540" rx="47" fill="#E7F2EC" opacity=".87"/>
    <path d="M24 471 C200 521 367 533 561 470" fill="none" stroke="#BBD9D1" stroke-width="9"/>
    ${diagram}
    <rect x="125" y="500" width="340" height="45" rx="22" fill="#047F7B" opacity=".94"/>
    <text x="295" y="531" text-anchor="middle" font-family="DejaVu Sans, Arial" font-size="22" font-weight="bold" fill="#FFFFFF">SKEMË ANATOMIKE</text>
  </g>`;
}

function cardSvg(term) {
  const label=term.latin || term.term;
  const title=wrapWords(label.toUpperCase(),label.length>26?21:26,2);
  const longest=Math.max(...title.map(s=>s.length));
  const titleSize=longest>25?53:longest>19?66:longest>13?78:96;
  const titleY=title.length===1?246:180;
  const titleText=`<text text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="900" fill="#F24A35" letter-spacing="-2">${title.map((line,i)=>`<tspan x="627" y="${titleY+i*(titleSize+10)}">${e(line)}</tspan>`).join('')}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1254" height="1254" viewBox="0 0 1254 1254">
    <defs><linearGradient id="teal" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#078E89"/><stop offset="1" stop-color="#006C6D"/></linearGradient></defs>
    <rect width="1254" height="1254" fill="#FFF9EF"/>
    <rect x="342" y="25" width="570" height="100" rx="48" fill="url(#teal)"/>
    <text x="627" y="97" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="71" font-weight="900" fill="#FFFFFF">DRX MEDLEX</text>
    ${titleText}
    ${doctor()}
    ${art(term)}
    <rect x="20" y="925" width="1214" height="134" rx="54" fill="#BFECE8"/>
    ${textLines(term.definition,{y:985,maxChars:51,size:40,spacing:1.2})}
    <rect x="20" y="1085" width="1214" height="142" rx="51" fill="url(#teal)"/>
    ${textLines('Shembull: '+term.example,{y:1143,color:'#FFFFFF',maxChars:53,size:38,spacing:1.2})}
  </svg>`;
}

async function run() {
  if(dictionary.status!=='draft_for_clinical_review')throw Error('MedLex anatomy source must retain clinical review status');
  const ids=new Set();
  for(const t of terms){
    if(!/^\w{2}\d{2}$/.test(t.id)||ids.has(t.id))throw Error('Invalid or duplicated MedLex ID: '+t.id);
    if(!dictionary.groups.some(g=>g.id===t.group))throw Error('Unknown group: '+t.group);
    if(!/^(?:abdomen|quadrant|direction|layers|upper|lower|thorax|head|neck|back|pelvis):/.test(t.visual))throw Error('Bad visual: '+t.id);
    ids.add(t.id);
  }
  fs.mkdirSync(output,{recursive:true});
  let cursor=0;
  const counts={};
  const concurrency=4;
  async function worker() {
    while(cursor<terms.length){
      const term=terms[cursor++];
      const target=path.join(output,term.id+'.webp');
      await sharp(Buffer.from(cardSvg(term))).webp({quality:85,effort:5}).toFile(target);
      counts[term.group]=(counts[term.group]||0)+1;
    }
  }
  await Promise.all(Array.from({length:concurrency},()=>worker()));
  console.log('MedLex anatomy: '+terms.length+' illustrated WebP cards generated');
  console.log(counts);
}

if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={cardSvg,terms};
