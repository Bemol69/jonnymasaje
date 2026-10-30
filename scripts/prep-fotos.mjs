// Uso único: recorta las fotos de material-cliente/ig a img/ (las que se usan en la web)
import sharp from 'sharp';
const IG = 'material-cliente/ig/';
const jobs = [
  ['Dexx.webp', 'img/jonny.jpg', { left: 95, top: 0, width: 290, height: 640 }],
  ['DenCm.jpg', 'img/servicios/relajacion.jpg', { left: 0, top: 84, width: 357, height: 472 }],
  ['DeasP.jpg', 'img/servicios/descontracturante.jpg', null],
  ['DeAiT.jpg', 'img/servicios/descarga-muscular.jpg', { left: 330, top: 330, width: 310, height: 310 }],
  ['DeTHm.webp', 'img/servicios/piedras-calientes.jpg', null],
  ['Defe.webp', 'img/flyer.jpg', null],
  ['DeAhA.jpg', 'img/logo.jpg', { left: 135, top: 40, width: 310, height: 310 }],
];
for (const [src, out, crop] of jobs) {
  let s = sharp(IG + src);
  if (crop) s = s.extract(crop);
  await s.jpeg({ quality: 90 }).toFile(out);
  console.log('ok', out);
}
// Imagen para compartir (1200x630): el flyer crema centrado
await sharp(IG + 'Defe.webp').resize({ height: 630 }).extend({ left: 340, right: 340, background: '#f4ede2' }).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 85 }).toFile('img/og-base.jpg');
console.log('ok og-base');
