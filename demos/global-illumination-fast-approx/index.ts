// thanks Alex Evans
// oxlint-disable no-unnecessary-type-assertion -- tsgo and oxlint disagree on WebGL nullability
// oxlint-disable strict-boolean-expressions -- WebGL getShaderParameter/getProgramParameter return any

type Rect = {
  backgroundColor: string
  borderRadius: number
  image: HTMLImageElement | null
  x: number
  y: number
  sizeX: number
  sizeY: number
}

function getViewportSize() {
  return {
    height: document.documentElement.clientHeight,
    width: document.documentElement.clientWidth,
  }
}

function drawRoundedRect(context: CanvasRenderingContext2D, rect: Rect, scale: number) {
  const x = rect.x * scale + 1
  const y = rect.y * scale + 1
  const sizeX = rect.sizeX * scale - 2
  const sizeY = rect.sizeY * scale - 2
  const borderRadius = rect.borderRadius * scale

  context.beginPath()
  context.moveTo(x + borderRadius, y)
  context.arcTo(x + sizeX, y, x + sizeX, y + borderRadius, borderRadius)
  context.arcTo(x + sizeX, y + sizeY, x + sizeX - borderRadius, y + sizeY, borderRadius)
  context.arcTo(x, y + sizeY, x, y + sizeY - borderRadius, borderRadius)
  context.arcTo(x, y, x + borderRadius, y, borderRadius)
  context.closePath()

  if (rect.image != null) {
    context.save()
    context.clip()
    context.drawImage(rect.image, x, y, sizeX, sizeY)
    context.restore()
  } else {
    context.fillStyle = rect.backgroundColor
    context.fill()
  }
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

  function makeFullscreenProgram(fragmentShaderSource: string) {
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

  const mipBlurProgram = makeFullscreenProgram(`
    precision mediump float;
    uniform vec2 canvasSize;
    uniform sampler2D minimapTexture;
    uniform int minimapLevel;
    in vec2 vuv;
    out vec4 color;
    void main() {
      vec2 uv = vuv;
      vec2 o = vec2(0.75) / canvasSize;
      vec2 p = o * 1.6;
      color = (
        textureLod(minimapTexture, uv + vec2( o.x,  o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-o.x,  o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( o.x, -o.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-o.x, -o.y), float(minimapLevel)) +
        (textureLod(minimapTexture, uv + vec2( p.x, 0.), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2(-p.x, 0.), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( p.x, -p.y), float(minimapLevel)) +
        textureLod(minimapTexture, uv + vec2( p.x,  p.y), float(minimapLevel))) * 0.5
      ) * (1. / 6.);
    }
  `)

  const program = makeFullscreenProgram(`
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
  const canvasres = 0.5
  const minimapTexture = gl.createTexture()!
  const minimapBlurTexture = gl.createTexture()!
  const minimapBlurFbo = gl.createFramebuffer()!
  const maxMinimapMip = 6
  let minimapBlurWidth = 0
  let minimapBlurHeight = 0
  let rects: Rect[] = []
  let sceneDirty = true
  let scheduledRaf: number | null = null
  const cursorPosition = { x: 0, y: 0 }

  gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL, maxMinimapMip)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  gl.bindTexture(gl.TEXTURE_2D, minimapBlurTexture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  const mipBlurCanvasSizeLocation = gl.getUniformLocation(mipBlurProgram, 'canvasSize')
  const mipBlurTextureLocation = gl.getUniformLocation(mipBlurProgram, 'minimapTexture')
  const mipBlurLevelLocation = gl.getUniformLocation(mipBlurProgram, 'minimapLevel')
  const canvasSizeLocation = gl.getUniformLocation(program, 'canvasSize')
  const cursorPositionLocation = gl.getUniformLocation(program, 'cursorPosition')
  const minimapTextureLocation = gl.getUniformLocation(program, 'minimapTexture')

  gl.useProgram(mipBlurProgram)
  gl.uniform1i(mipBlurTextureLocation, 0)

  gl.useProgram(program)
  gl.uniform1i(minimapTextureLocation, 0)

  function scheduleRender() {
    if (scheduledRaf != null) return
    scheduledRaf = requestAnimationFrame(function renderOnce() {
      scheduledRaf = null
      render()
    })
  }

  function redrawMinimap() {
    const viewport = getViewportSize()
    const minimapWidth = Math.max(1, Math.floor(viewport.width * scale))
    const minimapHeight = Math.max(1, Math.floor(viewport.height * scale))
    const minimapSizeChanged = minimap.width !== minimapWidth || minimap.height !== minimapHeight
    if (minimapSizeChanged) {
      minimap.width = minimapWidth
      minimap.height = minimapHeight
    }

    minimap2d.clearRect(0, 0, minimap.width, minimap.height)
    for (let i = 0; i < rects.length; ++i) {
      drawRoundedRect(minimap2d, rects[i]!, scale)
    }

    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    if (minimapSizeChanged) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, minimap)
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, minimap)
    }
    gl.generateMipmap(gl.TEXTURE_2D)

    const blurWidth = Math.max(1, minimap.width >> 1)
    const blurHeight = Math.max(1, minimap.height >> 1)
    if (blurWidth !== minimapBlurWidth || blurHeight !== minimapBlurHeight) {
      minimapBlurWidth = blurWidth
      minimapBlurHeight = blurHeight
      gl.bindTexture(gl.TEXTURE_2D, minimapBlurTexture)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, blurWidth, blurHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    }

    gl.useProgram(mipBlurProgram)
    gl.bindFramebuffer(gl.FRAMEBUFFER, minimapBlurFbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minimapBlurTexture, 0)
    for (let mip = 1; mip <= maxMinimapMip; ++mip) {
      const mipWidth = (minimap.width >> mip) || 1
      const mipHeight = (minimap.height >> mip) || 1
      gl.viewport(0, 0, mipWidth, mipHeight)
      gl.uniform2f(mipBlurCanvasSizeLocation, mipWidth, mipHeight)
      gl.uniform1i(mipBlurLevelLocation, mip - 1)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
      gl.copyTexSubImage2D(gl.TEXTURE_2D, mip, 0, 0, 0, 0, mipWidth, mipHeight)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    sceneDirty = false
  }

  function render() {
    if (sceneDirty) redrawMinimap()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.uniform2f(cursorPositionLocation, cursorPosition.x, cursorPosition.y)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }

  function resizeCanvas() {
    const viewport = getViewportSize()
    canvas.width = viewport.width * canvasres
    canvas.height = viewport.height * canvasres
    canvas.style.width = viewport.width + 'px'
    canvas.style.height = viewport.height + 'px'
    gl.useProgram(program)
    gl.uniform2f(canvasSizeLocation, canvas.width, canvas.height)
    sceneDirty = true
    scheduleRender()
  }

  function setRects(nextRects: Rect[]) {
    rects = nextRects
    sceneDirty = true
    scheduleRender()
  }

  function setCursorPosition(x: number, y: number) {
    const nextX = x * canvasres
    const nextY = y * canvasres
    if (cursorPosition.x === nextX && cursorPosition.y === nextY) return
    cursorPosition.x = nextX
    cursorPosition.y = nextY
    scheduleRender()
  }

  gl.clearColor(0., 0., 0., 1.)

  return {
    resizeCanvas,
    setCursorPosition,
    setRects,
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const renderer = magicSetup(canvas)
const grid = document.getElementById('grid')!
const thumbs: HTMLImageElement[] = []
const domImages: HTMLImageElement[] = []
const IMAGE_COUNT = 20
let rects: Rect[] = []
let mouseX = getViewportSize().width / 2
let mouseY = getViewportSize().height / 2

function refreshScene() {
  renderer.setRects(rects)
}

for (let i = 0; i < IMAGE_COUNT; i++) {
  const thumb = new Image()
  thumb.crossOrigin = 'anonymous'
  thumb.onload = refreshScene
  thumb.onerror = refreshScene
  thumb.src = 'https://picsum.photos/seed/' + (i + 10) + '/128/128'
  thumbs.push(thumb)

  const domImg = document.createElement('img')
  domImg.draggable = false
  domImg.src = 'https://picsum.photos/seed/' + (i + 10) + '/400/400'
  grid.appendChild(domImg)
  domImages.push(domImg)
}

function layoutGrid() {
  const viewport = getViewportSize()
  const cols = 5
  const rows = 4
  const gap = 24
  const marginX = 60
  const marginY = 60
  const cellW = (viewport.width - marginX * 2 - gap * (cols - 1)) / cols
  const cellH = (viewport.height - marginY * 2 - gap * (rows - 1)) / rows

  const nextRects: Rect[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const idx = row * cols + col
      const x = marginX + col * (cellW + gap)
      const y = marginY + row * (cellH + gap)
      const domImg = domImages[idx]!
      const thumb = thumbs[idx]

      domImg.style.left = x + 'px'
      domImg.style.top = y + 'px'
      domImg.style.width = cellW + 'px'
      domImg.style.height = cellH + 'px'

      nextRects.push({
        backgroundColor: '#333',
        borderRadius: 8,
        image: thumb != null && thumb.complete && thumb.naturalWidth > 0 ? thumb : null,
        sizeX: cellW,
        sizeY: cellH,
        x,
        y,
      })
    }
  }
  rects = nextRects
  renderer.setRects(rects)
}

function updateCursorPosition(x: number, y: number) {
  if (mouseX === x && mouseY === y) return
  mouseX = x
  mouseY = y
  renderer.setCursorPosition(x, y)
}

document.addEventListener('pointermove', function(event) {
  updateCursorPosition(event.clientX, event.clientY)
})

document.addEventListener('mousemove', function(event) {
  if ('PointerEvent' in window) return
  updateCursorPosition(event.clientX, event.clientY)
})

function ontouch(event: TouchEvent) {
  event.preventDefault()
  const touch = event.touches[0] ?? event.changedTouches[0]
  if (touch == null) return
  updateCursorPosition(touch.clientX, touch.clientY)
}

document.documentElement.style.touchAction = 'none'
window.addEventListener('touchstart', ontouch)
window.addEventListener('touchend', ontouch)
window.addEventListener('touchcancel', ontouch)
window.addEventListener('touchmove', ontouch)

window.addEventListener('resize', function() {
  renderer.resizeCanvas()
  layoutGrid()
  renderer.setCursorPosition(mouseX, mouseY)
})

renderer.resizeCanvas()
layoutGrid()
renderer.setCursorPosition(mouseX, mouseY)
