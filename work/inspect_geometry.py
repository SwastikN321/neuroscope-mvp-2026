import json
import numpy as np
from PIL import Image, ImageDraw
from math import sin, cos, tan, pi
meshes = json.load(open('work/sculpture-geometry.json'))
rx,ry,rz=.28,-.58,-.13
Rx=np.array([[1,0,0],[0,cos(rx),-sin(rx)],[0,sin(rx),cos(rx)]])
Ry=np.array([[cos(ry),0,sin(ry)],[0,1,0],[-sin(ry),0,cos(ry)]])
Rz=np.array([[cos(rz),-sin(rz),0],[sin(rz),cos(rz),0],[0,0,1]])
R=Rx@Ry@Rz
light=np.array([-3.,5.,4.]); light/=np.linalg.norm(light)
rim=np.array([4.,1.,-2.]); rim/=np.linalg.norm(rim)
polys=[]
for mesh in meshes:
    p=np.array(mesh['positions']).reshape(-1,3)@R.T
    n=np.array(mesh['normals']).reshape(-1,3)@R.T
    f=np.array(mesh['indices']).reshape(-1,3)
    xy=p[:,:2]/(6.55-p[:,2:3])*1500
    xy[:,0]+=500; xy[:,1]=350-xy[:,1]
    for tri in f:
        norm=n[tri].mean(axis=0)
        if norm[2] < -.1: continue
        depth=p[tri,2].mean()
        diffuse=max(0.,norm@light)
        edge=max(0.,norm@rim)
        spec=max(0., norm@np.array([-.3,.5,.8]))**24
        col=np.clip(np.array([44,66,83])*(.3+diffuse*1.5)+np.array([14,47,120])*edge + np.array([150,184,190])*spec, 0,255).astype('uint8')
        polys.append((depth,xy[tri].reshape(-1).tolist(),tuple(col)))
img=Image.new('RGB',(1000,700),(6,8,13)); d=ImageDraw.Draw(img)
for _,points,col in sorted(polys,key=lambda x:x[0]): d.polygon(points, fill=col)
img.save('work/sculpture-geometry-inspection.png')
print('Offline geometry-only silhouette inspection saved; this is not a browser screenshot.')
