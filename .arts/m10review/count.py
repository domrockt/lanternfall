import sys
W,H=960,540
data=open('shots/tmp_density.rgb','rb').read()
PAL=[0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xff8a6b,0x16261e,0x22382a,0x3d5a38,0x6f9b58]
def ch(i): return (i>>16,(i>>8)&255,i&255)
RIM=chr
grids={
 'spit': ["...000...","..0vv0...",".0vvuuv0.","0vuuuuuv0","0uuuuuuu0","0uuuuuuv0",".0uuuuvv0","..0uuuv0.","...0u0...","....t...."],
 'bone': [".00...00.","0db0.0bb0","0baa0bbb0",".0baaab0.","0baa0baa0","0ba0.0ba0",".00...00."],
 'shadow':["...000...","..09990..",".0990..90","0990...90","0550.....","0550.....",".0550....","..08880..","...000..."],
 'fire':["....0....","...0j0...","...0j0...","..0jk0...","..0jk0...",".0jkmmk0.",".0jkmmk0.","0jjkkkkj0","0jjhhhkj0",".0jhhhj0.","..0jhhj0.","...000..."],
}
def chmap(c):
    if c.isdigit(): return int(c)
    return ord(c)-97+10
def px(x,y):
    o=(y*W+x)*3; return (data[o],data[o+1],data[o+2])
# build 2x target for each sprite, and find bounding boxes of exact match
for name,g in grids.items():
    h=len(g); w=len(g[0])
    mask=[(chmap(c),x,y) for y,row in enumerate(g) for x,c in enumerate(row) if c!="."]
    # target color at 2x: (x0+2x, y0+2y) and (x0+2x+1,y0+2y+1)
    hits=[]
    for y0 in range(0,H-2*h+1):
        for x0 in range(0,W-2*w+1):
            ok=True
            for ci,x,y in mask:
                if ci==0:  # don't require contour (bg may equal ink? actually ink=6,7,12)
                    pass
                tgt=ch(PAL[ci])
                if px(x0+2*x,y0+2*y)!=tgt or px(x0+2*x+1,y0+2*y+1)!=tgt: ok=False; break
            if ok: hits.append((x0,y0))
    # dedupe adjacent
    ded=[]
    for h0 in hits:
        if not any(abs(h0[0]-d[0])<4 and abs(h0[1]-d[1])<4 for d in ded): ded.append(h0)
    print(name,'candidate hits',len(hits),'distinct',len(ded),ded[:30])
