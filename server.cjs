const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT || 5173);
const clients = new Set();
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf','.txt':'text/plain; charset=utf-8'};
const reload = '<script>new EventSource("/__reload").onmessage=()=>location.reload();</script>';
const server = http.createServer((req,res) => {
  if (req.url === '/__reload') {
    res.writeHead(200, {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
    res.write(': connected\n\n'); clients.add(res); req.on('close',()=>clients.delete(res)); return;
  }
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400);res.end();return; }
  const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403);res.end();return;}
  fs.readFile(file, (error, data) => {
    if (error) {res.writeHead(404);res.end('Not found');return;}
    const extension = path.extname(file);
    res.writeHead(200, {'Content-Type':types[extension] || 'application/octet-stream','Cache-Control':'no-store'});
    res.end(extension === '.html' ? data.toString().replace('</body>', reload + '</body>') : data);
  });
});
let timer;
fs.watch(root, {recursive:true}, (_,name) => {
  if (!name || name.startsWith('.')) return;
  clearTimeout(timer); timer=setTimeout(()=>clients.forEach(client=>client.write('data: reload\n\n')),150);
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? `Port ${port} is in use. Try PORT=5174 npm run dev` : error); process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log(`Plopdrobe → http://localhost:${port}\nSave a file to refresh the preview.`));
