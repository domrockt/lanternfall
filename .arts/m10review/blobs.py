W,H=960,540
data=open('shots/tmp_density.rgb','rb').read()
PAL=[0x06070c,0x0a0e16,0x101724,0x17202e,0x1e2a3a,0x2a3547,0x3a4a5c,0x4e5f6e,0x6b7c86,0x8fa0a6,0xb8c4c2,0xd9ddcd,0xf2edd8,0xfff8e6,0x2b1410,0x4d2214,0x7a331a,0xa84a21,0xcf6b26,0xef9130,0xffb84d,0xffd77a,0xffeeb0,0x3d1220,0x7a1f2e,0xb8303f,0xe4574d,0xff8a6b,0x16261e,0x22382a,0x3d5a38,0x6f9b58]
def px(x,y):
    o=(y*W+x)*3; return (data[o],data[o+1],data[o+2])
def near(p,t,tol=20):
    tgt=PAL[t]; c=((tgt>>16,tgt>>8&255,tgt&255))
    return abs(p[0]-c[0])<=tol and abs(p[1]-c[1])<=tol and abs(p[2]-c[2])<=tol
for label,inds in [('bone',[10,11]),('fire',[19,20]),('mist',[8,9]),('marshLight',[31]),('mossDark',[29])]:
    pts=[(x,y) for y in range(H) for x in range(W) if any(near(px(x,y),i) for i in inds)]
    # cluster by 4-neighb hour via union find on grid downsample coarse
    print(label,'pixels',len(pts))
