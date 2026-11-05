import os
D=os.path.dirname(os.path.abspath(__file__))
FONTES='file:///home/user/Multi-telas/fonts/fontes.css'
BASE='''*{box-sizing:border-box;margin:0;padding:0}html,body{width:%dpx;height:%dpx;overflow:hidden}
body{font-family:Inter,sans-serif;-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.marca{display:flex;align-items:center;gap:18px;font-weight:700;font-size:52px;letter-spacing:-.01em}
.marca svg{width:58px;height:58px;flex:none}'''
SOL='<svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="13" fill="#f2c14e"/><g stroke="#f2c14e" stroke-width="5" stroke-linecap="round"><path d="M30 4v8M30 48v8M4 30h8M48 30h8M11.6 11.6l5.7 5.7M42.7 42.7l5.7 5.7M11.6 48.4l5.7-5.7M42.7 17.3l5.7-5.7"/></g></svg>'
VIDA='<svg viewBox="0 0 60 60"><rect x="2" y="2" width="56" height="56" rx="16" fill="#0f766e"/><path d="M30 15v30M15 30h30" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>'
ALFA='<svg viewBox="0 0 60 60"><path d="M30 6 56 54H4z" fill="#f4a261"/><path d="M30 26 42 48H18z" fill="#14233c"/></svg>'
def qr():
    # QR estilizado (só para a imagem de referência; na TV é um QR de verdade)
    import random; random.seed(7); n=25; c=''
    for y in range(n):
        for x in range(n):
            canto=(x<7 and y<7) or (x>=n-7 and y<7) or (x<7 and y>=n-7)
            if canto: continue
            if random.random()<.5: c+=f'<rect x="{x}" y="{y}" width="1" height="1"/>'
    for (ox,oy) in [(0,0),(n-7,0),(0,n-7)]:
        c+=f'<rect x="{ox}" y="{oy}" width="7" height="7"/><rect x="{ox+1}" y="{oy+1}" width="5" height="5" fill="#fff"/><rect x="{ox+2}" y="{oy+2}" width="3" height="3"/>'
    return f'<svg viewBox="-2 -2 {n+4} {n+4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="{n+4}" height="{n+4}" fill="#fff"/><g fill="#111">{c}</g></svg>'
T={}
# ---------- COMÉRCIO: Padaria Sol (creme, terracota, amarelo; Archivo Black + Inter)
T['c1-oferta']=(1920,1080,'''
body{background:#f6eadb;color:#2b1a12;display:grid;grid-template-columns:900px 1fr}
.foto{background:url(pao-de-queijo.jpg) 40% center/cover}
.lado{padding:96px 110px 80px 100px;display:flex;flex-direction:column}
.kicker{font-size:52px;font-weight:700;letter-spacing:.08em;color:#9a3f1c;text-transform:uppercase}
h1{font-family:"Archivo Black";font-size:150px;line-height:.95;letter-spacing:-.02em;margin-top:30px}
.preco{margin-top:56px;display:flex;align-items:flex-start;color:#9a3f1c;white-space:nowrap}
.preco sup{font-family:"Archivo Black";font-size:96px;line-height:1;margin:22px 18px 0 0}
.preco b{font-family:"Archivo Black";font-weight:400;font-size:260px;line-height:.85;letter-spacing:-.04em}
.preco small{font-size:64px;font-weight:700;color:#2b1a12;align-self:flex-end;margin:0 0 18px 24px}
.rodape{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:52px;font-weight:600;white-space:nowrap}
.cta{background:#2b1a12;color:#f6eadb;border-radius:999px;padding:18px 40px;font-weight:700}
''','''<div class="foto"></div><div class="lado"><div class="kicker">Só hoje, até 18h</div><h1>Pão de queijo</h1>
<div class="preco"><sup>R$</sup><b>0,90</b><small>cada</small></div>
<div class="rodape"><div class="marca">'''+SOL+'''Padaria Sol</div><span class="cta">Peça no balcão</span></div></div>''')
T['c2-cardapio']=(1920,1080,'''
body{background:#2b1a12;color:#f6eadb;display:grid;grid-template-columns:1fr 1120px}
.foto{background:url(cafe-manha.jpg) 30% center/cover}
.menu{padding:80px 96px 64px 88px;display:flex;flex-direction:column}
.topo{display:block}
h1{font-family:"Archivo Black";font-size:112px;line-height:1;letter-spacing:-.02em;color:#f2c14e;white-space:nowrap}
.ate{font-size:52px;font-weight:600;color:#e9cdb0;margin-top:14px}
ul{list-style:none;margin-top:44px;display:flex;flex-direction:column;gap:24px}
li{display:flex;align-items:baseline;font-size:64px;font-weight:600}
li span{flex:1;border-bottom:4px dotted rgba(246,234,219,.35);margin:0 22px;transform:translateY(-12px)}
li b{font-family:"Archivo Black";font-weight:400}
li.combo{background:#f2c14e;color:#2b1a12;margin:12px -36px 0;padding:20px 36px 24px;border-radius:24px;flex-wrap:wrap}
li.combo span{border-color:rgba(43,26,18,.35)}
li.combo em{font-style:normal;font-size:49px;font-weight:800;letter-spacing:.08em;width:100%;margin-bottom:6px}
.marca{margin-top:auto;color:#f6eadb}
''','''<div class="foto"></div><div class="menu"><div class="topo"><h1>Café da manhã</h1><div class="ate">Servido até as 11h</div></div>
<ul><li>Café com leite<span></span><b>7,50</b></li><li>Pão na chapa<span></span><b>6,00</b></li><li>Pão de queijo (6)<span></span><b>5,40</b></li><li>Misto quente<span></span><b>12,00</b></li>
<li class="combo"><em>COMBO</em>Café + pão na chapa<span></span><b>11,90</b></li></ul>
<div class="marca">'''+SOL+'''Padaria Sol</div></div>''')
T['c3-totem']=(1080,1920,'''
body{background:#f6eadb;color:#2b1a12;display:flex;flex-direction:column}
.foto{height:900px;background:url(pao-de-queijo.jpg) center 60%/cover}
.txt{flex:1;padding:80px 72px 72px;display:flex;flex-direction:column}
h1{font-family:"Archivo Black";font-size:116px;line-height:1;letter-spacing:-.02em}
p{font-size:64px;font-weight:600;margin-top:28px;color:#6b4a36}
.qr{margin-top:auto;display:flex;gap:44px;align-items:center}
.qr svg{width:330px;height:330px;border-radius:20px;flex:none}
.qr div{font-size:56px;font-weight:700;line-height:1.2}
.qr div b{display:block;font-family:"Archivo Black";font-weight:400;font-size:64px;color:#9a3f1c;margin-top:16px}
''','''<div class="foto"></div><div class="txt"><h1>Encomendas para o fim de semana</h1><p>Bolos, tortas e salgados.</p>
<div class="qr">'''+qr()+'''<div>Aponte a câmera e peça pelo WhatsApp<b>(11) 99999-0000</b></div></div></div>''')
# ---------- SAÚDE: Clínica Vida (off-white, verde-azulado; Nunito + Inter)
T['s1-senha']=(1920,1080,'''
body{background:#f3f7f6;color:#0b2b28;display:grid;grid-template-columns:1fr 720px;font-family:Nunito}
.principal{padding:88px 96px 72px;display:flex;flex-direction:column}
.rot{font-size:64px;font-weight:800;color:#0f766e;letter-spacing:.02em}
.senha{font-size:330px;font-weight:900;line-height:.9;letter-spacing:-.03em;margin-top:10px}
.onde{font-size:116px;font-weight:800;margin-top:24px}
.marca{margin-top:auto;font-family:Nunito;font-weight:800}
.lado{background:#0f766e;color:#fff;padding:88px 80px 72px;display:flex;flex-direction:column}
.lado h2{font-size:52px;font-weight:800;opacity:.9}
.lado ul{list-style:none;margin-top:36px;display:flex;flex-direction:column;gap:26px}
.lado li{display:flex;justify-content:space-between;font-size:64px;font-weight:800}
.lado li span{font-weight:600;opacity:.9}
.hora{margin-top:auto;font-size:120px;font-weight:900;line-height:1}
.dia{font-size:52px;font-weight:700;opacity:.9;margin-top:12px}
''','''<div class="principal"><div class="rot">Senha</div><div class="senha">A 042</div><div class="onde">Consultório 3</div>
<div class="marca">'''+VIDA+'''Clínica Vida</div></div>
<div class="lado"><h2>Chamadas anteriores</h2><ul><li>A 041<span>Cons. 1</span></li><li>A 040<span>Cons. 2</span></li><li>A 039<span>Cons. 3</span></li></ul>
<div class="hora">14:32</div><div class="dia">Quinta, 5 de novembro</div></div>''')
T['s2-campanha']=(1920,1080,'''
body{background:#123a63;color:#fff;font-family:Nunito;padding:96px 110px 72px;display:flex;flex-direction:column;position:relative;overflow:hidden}
body:after{content:"";position:absolute;right:-560px;bottom:-560px;width:1100px;height:1100px;border-radius:50%;border:100px solid #1f5d97;opacity:.7;z-index:0}
body>*{z-index:1}
.k{position:relative;font-size:56px;font-weight:800;color:#9fd0ff;letter-spacing:.04em;text-transform:uppercase}
h1{position:relative;font-size:150px;font-weight:900;line-height:1.02;letter-spacing:-.02em;margin-top:40px;max-width:1400px}
p{position:relative;font-size:72px;font-weight:700;line-height:1.25;margin-top:44px;max-width:1350px;color:#dcebfa}
.rod{position:relative;margin-top:auto;display:flex;gap:64px;align-items:center;font-size:52px;font-weight:700;color:#cfe3f7}
.marca{color:#fff;font-family:Nunito;font-weight:800}
''','''<div class="k">Novembro Azul</div><h1>Homem também vai ao médico.</h1>
<p>Converse com o seu médico sobre os exames certos para a sua idade.</p>
<div class="rod"><span>Fonte: Ministério da Saúde</span><div class="marca">'''+VIDA+'''Clínica Vida</div></div>''')
T['s3-horario']=(1080,1920,'''
body{background:#f3f7f6;color:#0b2b28;font-family:Nunito;padding:96px 72px 72px;display:flex;flex-direction:column}
.marca{font-family:Nunito;font-weight:800;font-size:60px}
h1{font-size:120px;font-weight:900;line-height:1;letter-spacing:-.02em;margin-top:80px}
table{margin-top:56px;width:100%;border-collapse:collapse;font-size:64px}
td{padding:26px 0;border-bottom:4px solid #d4e6e2;font-weight:700}
td+td{text-align:right;font-weight:900;color:#0f766e}
.fechado td+td{color:#5a6b68}
.qr{margin-top:auto;display:flex;gap:40px;align-items:center}
.qr svg{width:300px;height:300px;border-radius:20px;flex:none;box-shadow:0 0 0 6px #0f766e}
.qr div{font-size:60px;font-weight:800;line-height:1.2}
.rt{margin-top:56px;font-size:49px;font-weight:600;color:#4b6461;line-height:1.3}
''','''<div class="marca">'''+VIDA+'''Clínica Vida</div><h1>Horário de atendimento</h1>
<table><tr><td>Segunda a sexta</td><td>7h às 19h</td></tr><tr><td>Sábado</td><td>8h às 12h</td></tr><tr class="fechado"><td>Domingo e feriados</td><td>Fechado</td></tr></table>
<div class="qr">'''+qr()+'''<div>Agende pelo WhatsApp: aponte a câmera</div></div>
<div class="rt">Responsável técnica: Dra. Ana Lima<br>CRM-SP 123456</div>''')
# ---------- EMPRESAS: Metalúrgica Alfa (azul-marinho, laranja; Space Grotesk + Inter)
T['e1-acidente']=(1920,1080,'''
body{background:#14233c;color:#fff;font-family:"Space Grotesk";padding:90px 110px 72px;display:flex;flex-direction:column}
.k{font-size:56px;font-weight:700;color:#f4a261;letter-spacing:.06em;text-transform:uppercase}
.linha{display:flex;align-items:flex-end;gap:56px;margin-top:20px}
.n{font-size:380px;font-weight:700;line-height:.82;letter-spacing:-.05em}
.l{font-size:120px;font-weight:700;line-height:1;padding-bottom:22px}
.barra{margin-top:70px;height:36px;border-radius:18px;background:#25385a;position:relative}
.barra i{position:absolute;inset:0 8% 0 0;border-radius:18px;background:#f4a261}
.meta{display:flex;justify-content:space-between;margin-top:22px;font-size:56px;font-weight:600;color:#c9d3e3}
.rod{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:49px;font-weight:600;color:#aab6c9}
.marca{color:#fff;font-family:"Space Grotesk"}
''','''<div class="k">Segurança</div><div class="linha"><div class="n">312</div><div class="l">dias sem<br>acidente</div></div>
<div class="barra"><i></i></div><div class="meta"><span>Faltam 28 para o recorde</span><span>Recorde: 340</span></div>
<div class="rod"><span>Atualizado hoje às 7h · SESMT</span><div class="marca">'''+ALFA+'''Alfa</div></div>''')
T['e2-indicador']=(1920,1080,'''
body{background:#0f1b2e;color:#fff;font-family:"Space Grotesk";padding:90px 110px 72px;display:flex;flex-direction:column}
h1{font-size:110px;font-weight:700;line-height:1;letter-spacing:-.01em}
h1 span{color:#8fa3c2}
.grande{display:flex;align-items:baseline;gap:34px;margin-top:64px}
.grande b{font-size:270px;font-weight:700;line-height:.85;letter-spacing:-.04em}
.grande small{font-size:80px;font-weight:600;color:#c9d3e3}
.var{margin-left:auto;font-size:60px;font-weight:700;color:#5ee0a0;align-self:center;white-space:nowrap}
.meta{margin-top:70px;font-size:56px;font-weight:600;color:#c9d3e3;display:flex;justify-content:space-between}
.barra{margin-top:20px;height:40px;border-radius:20px;background:#22324d;position:relative}
.barra i{position:absolute;left:0;top:0;bottom:0;width:100%;border-radius:20px;background:#5ee0a0}
.barra u{position:absolute;top:-16px;bottom:-16px;left:92%;width:8px;background:#fff;border-radius:4px}
.rod{margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:49px;font-weight:600;color:#aab6c9}
.marca{color:#fff;font-family:"Space Grotesk"}
''','''<h1>Produção de novembro <span>· Linha 2</span></h1>
<div class="grande"><b>18.450</b><small>peças</small><div class="var">▲ 12% sobre outubro</div></div>
<div class="meta"><span>108% da meta</span><span>Meta: 17.000</span></div><div class="barra"><i></i><u></u></div>
<div class="rod"><span>Atualizado às 14h</span><div class="marca">'''+ALFA+'''Alfa</div></div>''')
T['e3-aniversario']=(1920,1080,'''
body{background:#14233c;color:#fff;font-family:"Space Grotesk";display:grid;grid-template-columns:820px 1fr}
.foto{background:url(fabrica.jpg) 78% center/cover}
.txt{padding:88px 100px 72px 96px;display:flex;flex-direction:column}
.k{font-size:56px;font-weight:700;color:#f4a261;letter-spacing:.06em;text-transform:uppercase}
h1{font-size:120px;font-weight:700;line-height:1;margin-top:26px;letter-spacing:-.02em}
ul{list-style:none;margin-top:56px;display:flex;flex-direction:column;gap:34px}
li{display:flex;align-items:center;gap:30px;font-size:64px;font-weight:700}
li i{width:104px;height:104px;border-radius:50%;background:#f4a261;color:#14233c;display:grid;place-items:center;font-style:normal;font-size:49px;font-weight:700;flex:none}
li span{display:block;font-size:49px;font-weight:500;color:#c9d3e3;margin-top:4px}
.marca{margin-top:auto;color:#fff;font-family:"Space Grotesk"}
''','''<div class="foto"></div><div class="txt"><div class="k">Novembro</div><h1>Parabéns!</h1>
<ul><li><i>AS</i><div>Ana Souza<span>Qualidade · dia 7</span></div></li><li><i>CL</i><div>Carlos Lima<span>Expedição · dia 12</span></div></li><li><i>JR</i><div>Joana Reis<span>RH · dia 23</span></div></li></ul>
<div class="marca">'''+ALFA+'''Alfa</div></div>''')
for nome,(w,h,css,corpo) in T.items():
    open(os.path.join(D,nome+'.html'),'w').write(f'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><link rel="stylesheet" href="{FONTES}"><style>{BASE%(w,h)}{css}</style><body>{corpo}</body></html>')
print(len(T),'telas')
