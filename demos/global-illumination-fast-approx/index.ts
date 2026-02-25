// thanks Alex Evans
export {} // module scope
// oxlint-disable no-unnecessary-type-assertion -- tsgo and oxlint disagree on WebGL nullability
// oxlint-disable strict-boolean-expressions -- WebGL getShaderParameter/getProgramParameter return any

type Rect = {
  image: HTMLImageElement | null
  backgroundColor: string
  borderRadius: number
  x: number
  y: number
  sizeX: number
  sizeY: number
}

function magicSetup(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl2')!
  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
  const vertexBuffer = gl.createBuffer()!
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW)
  const vertexShaderSource = `#version 300 es
    in vec2 position;
    out vec2 vuv;
    void main() {
      vuv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)!
  gl.shaderSource(vertexShader, vertexShaderSource)
  gl.compileShader(vertexShader)
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    console.error('Vertex shader failed to compile: \n' + gl.getShaderInfoLog(vertexShader))
  }
  function make_fullscreen_program(fragmentShaderSource: string) {
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(fragmentShader, '#version 300 es\n' + fragmentShaderSource)
    gl.compileShader(fragmentShader)
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('Fragment shader failed to compile: \n' + gl.getShaderInfoLog(fragmentShader))
    }
    const shaderProgram = gl.createProgram()!
    gl.attachShader(shaderProgram, vertexShader)
    gl.attachShader(shaderProgram, fragmentShader)
    gl.linkProgram(shaderProgram)
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      console.error('Shader program failed to link: \n' + gl.getProgramInfoLog(shaderProgram))
    }
    gl.useProgram(shaderProgram)
    const positionLocation = gl.getAttribLocation(shaderProgram, 'position')
    gl.enableVertexAttribArray(positionLocation)
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    return shaderProgram
  }
  const mipblurprog = make_fullscreen_program(`
    precision mediump float;
    uniform vec2 canvasSize;
    uniform sampler2D minimapTexture;
    uniform int minimapLevel;
    in vec2 vuv;
    out vec4 color;
    void main() {
      vec2 uv = vuv;
      vec2 o = vec2(0.75)/canvasSize;
      vec2 p = o*1.6;
      color=(
        textureLod(minimapTexture, uv + vec2( o.x,  o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-o.x,  o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( o.x, -o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-o.x, -o.y), float(minimapLevel)) +
        (textureLod(minimapTexture, uv + vec2( p.x, 0.), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-p.x, 0.), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( p.x, -p.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( p.x,  p.y), float(minimapLevel))) * 0.5
      ) * (1./6.);
    }
  `)
  const prog = make_fullscreen_program(`
    precision mediump float;
    uniform vec2 canvasSize;
    uniform vec2 cursorPosition;
    uniform sampler2D minimapTexture;
    out vec4 color;
    void main() {
      vec2 css = gl_FragCoord.xy;
      css.y=canvasSize.y-css.y;
      vec2 uv = css / canvasSize;
      float skyshadow =1.;
      float density = 0.35;
      vec3 skybounce = vec3(0.);
      for (float tap = 0.; tap <= 3.; tap += 0.25) {
        density *= 0.75;
        skyshadow*=1.-density*textureLod(minimapTexture, uv+vec2(0.,tap*-0.012), tap).w;
        skybounce+=density*pow(textureLod(minimapTexture, uv+vec2(0.,tap*0.008), tap).xyz, vec3(1.2));
      }
      vec3 skycol = vec3(0.95,0.92,0.88) * 0.7;
      vec3 c = (skyshadow + skybounce.xyz) * skycol;

      vec2 mouserel=(cursorPosition - css) / canvasSize.x;
      float mousebright = 0.07/ (dot(mouserel,mouserel)+0.075);
      float mouseshadow = mousebright;
      density = 0.15;
      vec2 mouseuv = (cursorPosition) / canvasSize;
      for (float tap = 0.; tap <= 3.; tap += 0.125) {
        density *= 0.95;
        mouseshadow*=1.-density*textureLod(minimapTexture, mix(uv, mouseuv, vec2(tap/3.)), tap).w;
      }
      vec2 refpos;
      refpos.x = mix(uv.x, mouseuv.x, 0.05);
      refpos.y = mix(uv.y, mouseuv.y, -0.05);
      vec3 mousebounce = 2. * mouseshadow * mousebright * mousebright * pow(textureLod(minimapTexture, refpos , 2.).xyz, vec3(1.2));
      c += (mousebounce + mouseshadow) * vec3(1.,0.75,0.5);
      c*=0.7;
      c+= 0.08*(pow(textureLod(minimapTexture, uv + vec2(0.,0.015) , 3.).xyz, vec3(1.2)) + pow(textureLod(minimapTexture, uv + vec2(0.,-0.015) , 3.).xyz, vec3(1.2)));
      c+= 0.12*(pow(textureLod(minimapTexture, uv + vec2(0.,0.03) , 4.).xyz, vec3(1.2)) + pow(textureLod(minimapTexture, uv + vec2(0.,-0.03) , 4.).xyz, vec3(1.2)));
      c+= 0.15*(pow(textureLod(minimapTexture, uv + vec2(0.,0.06) , 5.).xyz, vec3(1.2)) + pow(textureLod(minimapTexture, uv + vec2(0.,-0.06) , 5.).xyz, vec3(1.2)));
      color=vec4(pow(c,vec3(1./2.2)),1.);
    }
  `)

  const minimap = document.createElement('canvas')
  const minimap2d = minimap.getContext('2d')!
  const scale = 0.5
  const minimapTexture = gl.createTexture()!

  function redrawCanvas(rects: Rect[]) {
    const dpr = 0.5
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    canvas.style.width = window.innerWidth + 'px'
    canvas.style.height = window.innerHeight + 'px'

    minimap.width = window.innerWidth * scale
    minimap.height = window.innerHeight * scale
    minimap2d.clearRect(0, 0, minimap.width, minimap.height)
    rects.forEach(function(rect) {
      const x = rect.x * scale + 1
      const y = rect.y * scale + 1
      const sizeX = rect.sizeX * scale - 2
      const sizeY = rect.sizeY * scale - 2
      const borderRadius = rect.borderRadius * scale
      minimap2d.beginPath()
      minimap2d.moveTo(x + borderRadius, y)
      minimap2d.arcTo(x + sizeX, y, x + sizeX, y + borderRadius, borderRadius)
      minimap2d.arcTo(x + sizeX, y + sizeY, x + sizeX - borderRadius, y + sizeY, borderRadius)
      minimap2d.arcTo(x, y + sizeY, x, y + sizeY - borderRadius, borderRadius)
      minimap2d.arcTo(x, y, x + borderRadius, y, borderRadius)
      minimap2d.closePath()
      if (rect.image != null) {
        minimap2d.save()
        minimap2d.clip()
        minimap2d.drawImage(rect.image, x, y, sizeX, sizeY)
        minimap2d.restore()
      } else {
        minimap2d.fillStyle = rect.backgroundColor
        minimap2d.fill()
      }
    })
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    const maxmip = 6
    const imageData = minimap2d.getImageData(0, 0, minimap.width, minimap.height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxmip)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageData)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.generateMipmap(gl.TEXTURE_2D)

    const extraTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, extraTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, 1)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, minimap.width >> 1, minimap.height >> 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)

    const fbo = gl.createFramebuffer()!
    gl.useProgram(mipblurprog)
    const canvasSizeLocation = gl.getUniformLocation(mipblurprog, 'canvasSize')
    const minimapTextureLocation = gl.getUniformLocation(mipblurprog, 'minimapTexture')
    const minimapLevelLocation = gl.getUniformLocation(mipblurprog, 'minimapLevel')
    for (let mip = 1; mip <= maxmip; ++mip) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, extraTexture, 0)
      const mipwidth = (minimap.width >> mip) || 1
      const mipheight = (minimap.height >> mip) || 1
      gl.viewport(0, 0, mipwidth, mipheight)
      gl.uniform2f(canvasSizeLocation, mipwidth, mipheight)
      gl.uniform1i(minimapTextureLocation, 0)
      gl.uniform1i(minimapLevelLocation, mip - 1)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo)
      gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
      gl.copyTexSubImage2D(gl.TEXTURE_2D, mip, 0, 0, 0, 0, mipwidth, mipheight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
  }

  const canvasSizeLocation = gl.getUniformLocation(prog, 'canvasSize')
  const cursorPositionLocation = gl.getUniformLocation(prog, 'cursorPosition')
  const minimapTextureLocation = gl.getUniformLocation(prog, 'minimapTexture')

  function magicAnimate(pointerX: number, pointerY: number, rects: Rect[]) {
    redrawCanvas(rects)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(1.0, 0.5, 0.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(prog)
    gl.uniform2f(canvasSizeLocation, canvas.width, canvas.height)
    gl.uniform2f(cursorPositionLocation, pointerX * 0.5, pointerY * 0.5)
    gl.uniform1i(minimapTextureLocation, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  return magicAnimate
}

// --- Demo setup ---
const canvas = document.getElementById('canvas') as HTMLCanvasElement
const magicAnimate = magicSetup(canvas)
let mouseX = window.innerWidth / 2
let mouseY = window.innerHeight / 2

document.addEventListener('mousemove', function(e) {
  mouseX = e.clientX
  mouseY = e.clientY
})

// Small thumbnails for the shader (color/occlusion source), big ones for display
const thumbs: HTMLImageElement[] = []
const IMAGE_COUNT = 20
const grid = document.getElementById('grid')!
const domImages: HTMLImageElement[] = []

for (let i = 0; i < IMAGE_COUNT; i++) {
  const thumb = new Image()
  thumb.crossOrigin = 'anonymous'
  thumb.src = 'https://picsum.photos/seed/' + (i + 10) + '/128/128'
  thumbs.push(thumb)

  const domImg = document.createElement('img')
  domImg.src = 'https://picsum.photos/seed/' + (i + 10) + '/400/400'
  grid.appendChild(domImg)
  domImages.push(domImg)
}

function layoutGrid(): Rect[] {
  const w = window.innerWidth
  const h = window.innerHeight
  const cols = 5
  const rows = 4
  const gap = 24
  const marginX = 60
  const marginY = 60
  const cellW = (w - marginX * 2 - gap * (cols - 1)) / cols
  const cellH = (h - marginY * 2 - gap * (rows - 1)) / rows

  const rects: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      const x = marginX + col * (cellW + gap)
      const y = marginY + row * (cellH + gap)

      // position DOM image
      const el = domImages[idx]!
      el.style.left = x + 'px'
      el.style.top = y + 'px'
      el.style.width = cellW + 'px'
      el.style.height = cellH + 'px'

      // rect for shader
      const t = thumbs[idx]
      rects.push({
        image: (t != null && t.complete && t.naturalWidth > 0) ? t : null,
        backgroundColor: '#333',
        borderRadius: 8,
        x,
        y,
        sizeX: cellW,
        sizeY: cellH,
      })
    }
  }
  return rects
}

let rects = layoutGrid()
window.addEventListener('resize', function() { rects = layoutGrid() })

function loop() {
  rects = layoutGrid()
  magicAnimate(mouseX, mouseY, rects)
  requestAnimationFrame(loop)
}
requestAnimationFrame(loop)
