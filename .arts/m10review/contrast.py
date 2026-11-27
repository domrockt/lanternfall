def L(h):
    r,g,b=(h>>16)/255,((h>>8)&255)/255,(h&255)/255
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=L(a),L(b); return round((max(la,lb)+0.05)/(min(la,lb)+0.05),2)
ink=0x06070c
bgs={'nightDeep':0x0a0e16,'night':0x101724,'waterDeep':0x3a4a5c,'waterMid':0x4e5f6e,'grassMarsh':0x3d5a38}
for n,b in bgs.items(): print('ink vs',n,cr(ink,b))
colors={'spit29':0x22382a,'spit30':0x3d5a38,'spit31':0x6f9b58,'shadow5':0x2a3547,'shadow8':0x6b7c86,'shadow9':0x8fa0a6,'fire17':0xa84a21,'fire19':0xef9130,'fire20':0xffb84d,'fire22':0xffeeb0,'bone10':0xb8c4c2,'bone11':0xd9ddcd,'bone13':0xfff8e6}
for cn,c in colors.items():
    print(cn, {n:cr(c,b) for n,b in bgs.items()})
