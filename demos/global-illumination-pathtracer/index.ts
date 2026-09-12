// thanks Alex Evans
// oxlint-disable no-unnecessary-type-assertion -- tsgo and oxlint disagree on WebGL nullability
// oxlint-disable strict-boolean-expressions -- WebGL getShaderParameter/getProgramParameter return any

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const gl = canvas.getContext('webgl2')!

// White noise texture + R2 temporal sequence for good distribution
const bluenoise = gl.createTexture()!
function hash(n: number) {
  n = n | 0
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0xd35a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

;(function generateNoise() {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < data.length; i++) {
    data[i] = hash(i) * 256 | 0
  }
  gl.bindTexture(gl.TEXTURE_2D, bluenoise)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
})()

const vertices = new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1])
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

function drawRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, cornerRadius: number, fillStyle: string | HTMLImageElement) {
  context.beginPath()
  context.moveTo(x + cornerRadius, y)
  context.arcTo(x + width, y, x + width, y + cornerRadius, cornerRadius)
  context.arcTo(x + width, y + height, x + width - cornerRadius, y + height, cornerRadius)
  context.arcTo(x, y + height, x, y + height - cornerRadius, cornerRadius)
  context.arcTo(x, y, x + cornerRadius, y, cornerRadius)
  context.closePath()
  if (fillStyle instanceof Image) {
    context.save()
    context.clip()
    context.drawImage(fillStyle, x, y, width, height)
    context.restore()
  } else {
    context.fillStyle = fillStyle
    context.fill()
  }
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

// Final compositing: combine GI + direct light with tone mapping
const finalcompprog = make_fullscreen_program(`
  precision mediump float;
  uniform sampler2D giTexture;
  uniform sampler2D diTexture;
  in vec2 vuv;
  out vec4 color;
  void main() {
    vec4 gicolor = textureLod(giTexture, vuv, 0.);
    vec4 dicolor = textureLod(diTexture, vuv, 0.);
    vec3 hdr = gicolor.xyz * 4. + dicolor.xyz;
    hdr = hdr / (1. + hdr);
    color.xyz = pow(hdr, vec3(1./2.2));
    color.w = 1.;
  }
`)

// Mip blur
const mipblurprog = make_fullscreen_program(`
  precision mediump float;
  uniform vec2 canvasSize;
  uniform sampler2D minimapTexture;
  uniform int minimapLevel;
  in vec2 vuv;
  out vec4 color;
  void main() {
    vec2 uv = vuv - vec2(0.25)/canvasSize;
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

// GI denoise: wider edge-aware blur to calm stochastic speckle
const gidenoiseprog = make_fullscreen_program(`
  precision mediump float;
  uniform vec2 canvasSize;
  uniform sampler2D giTexture;
  uniform sampler2D minimapTexture;
  in vec2 vuv;
  out vec4 color;

  float occupancyAt(vec2 uv) {
    return textureLod(minimapTexture, vec2(uv.x, 1. - uv.y), 0.).w;
  }

  void addTap(inout vec3 sum, inout float weightSum, vec2 uv, float baseWeight, float centerOcc, vec3 centerColor) {
    vec3 tapColor = textureLod(giTexture, uv, 0.).xyz;
    float tapOcc = occupancyAt(uv);
    float edgeWeight = max(0., 1. - abs(tapOcc - centerOcc) * 10.);
    float colorWeight = 1. / (1. + length(tapColor - centerColor) * 3.5);
    float weight = baseWeight * edgeWeight * colorWeight;
    sum += tapColor * weight;
    weightSum += weight;
  }

  void main() {
    vec2 px = 1. / canvasSize;
    vec3 centerColor = textureLod(giTexture, vuv, 0.).xyz;
    float centerOcc = occupancyAt(vuv);
    vec3 sum = centerColor * 3.2;
    float weightSum = 3.2;
    addTap(sum, weightSum, vuv + vec2( px.x, 0.), 1.4, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x, 0.), 1.4, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(0.,  px.y), 1.4, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(0., -px.y), 1.4, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2( px.x,  px.y), 1.0, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x,  px.y), 1.0, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2( px.x, -px.y), 1.0, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x, -px.y), 1.0, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2( px.x * 2., 0.), 0.7, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x * 2., 0.), 0.7, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(0.,  px.y * 2.), 0.7, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(0., -px.y * 2.), 0.7, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2( px.x * 2.,  px.y * 2.), 0.45, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x * 2.,  px.y * 2.), 0.45, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2( px.x * 2., -px.y * 2.), 0.45, centerOcc, centerColor);
    addTap(sum, weightSum, vuv + vec2(-px.x * 2., -px.y * 2.), 0.45, centerOcc, centerColor);
    color = vec4(sum / weightSum, 1.);
  }
`)

// Direct illumination: trace toward cursor light
const diprog = make_fullscreen_program(`
  precision mediump float;
  uniform vec2 canvasSize;
  uniform vec2 cursorPosition;
  in vec2 vuv;
  uniform sampler2D minimapTexture;
  uniform sampler2D lightTexture;
  out vec4 color;
  void main() {
    vec2 o = vuv * canvasSize;
    o.y = canvasSize.y - o.y;
    vec2 sc = 1. / canvasSize;
    vec2 vec2light = o - cursorPosition;
    vec3 c;
    float T = 1.;
    for (float t = 0.; t < 1.; t += 0.021) {
      float tt = t * t;
      vec2 pos = mix(o, cursorPosition, tt) * sc;
      T *= 1. - 0.2 * textureLod(minimapTexture, pos, t * 2.).w;
    }
    c = vec3(T);
    c *= 10. / (1.1 + length(vec2light));
    c *= vec3(0.9, 0.8, 0.7);
    c += textureLod(lightTexture, vuv, 0.).xyz;
    color = vec4(c, 1.);
  }
`)

// GI pass: stochastic ray tracing with bounce
const prog = make_fullscreen_program(`
  precision mediump float;
  uniform float accumulationAlpha;
  uniform vec2 canvasSize;
  uniform vec2 cursorPosition;
  uniform vec2 noiseOffset;
  in vec2 vuv;
  uniform sampler2D minimapTexture;
  uniform sampler2D bluenoiseTexture;
  uniform sampler2D lightTexture;
  out vec4 color;
  void main() {
    vec2 o = vuv * canvasSize;
    vec4 noise = textureLod(bluenoiseTexture, o * (1./512.) + noiseOffset, 0.);
    o.y = canvasSize.y - o.y;
    vec2 sc = 1. / canvasSize;
    float theta = noise.x * 3.141592 * 2.;
    float T_target = noise.y * 0.8 + 0.1;
    vec2 d = vec2(sin(theta), cos(theta));
    float T = 1.;
    vec3 c = vec3(0.);
    float dt = 0.125;
    for (float t = dt * noise.z; t < 16.; t += dt) {
      vec2 pos = (o + t * t * d);
      float mip = t * 0.25;
      vec4 tap = textureLod(minimapTexture, pos * sc, mip);
      float occ = tap.w;
      T *= 1. - occ;
      if (T < T_target) {
        // compute normal
        float dx = textureLod(minimapTexture, (pos + vec2(2., 0.)) * sc, mip).w - occ;
        float dy = textureLod(minimapTexture, (pos + vec2(0., 2.)) * sc, mip).w - occ;
        vec2 n = normalize(vec2(dx, dy));
        // sample albedo
        vec3 albedo = pow(tap.xyz / tap.w, vec3(1.5));
        float ndotl = max(0., dot(n, d));
        vec2 refdir = reflect(d, n);
        vec2 readfrom = (pos + refdir * 5.) * sc;
        readfrom.y = 1. - readfrom.y;
        vec3 incominglight = textureLod(lightTexture, readfrom, 0.).xyz;
        c += incominglight * albedo * ndotl;
        break;
      }
    }
    if (T >= T_target) c += 0.1 * mix(vec3(0.1), vec3(0.3, 0.4, 0.5), d.y * -0.5 + 0.5);
    color = vec4(c, accumulationAlpha);
  }
`)

// FP16 render targets
const ext = gl.getExtension('EXT_color_buffer_half_float')
if (!ext) console.error('EXT_color_buffer_half_float not available')

const gifbo = gl.createFramebuffer()!
const gitexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, gitexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const gidenoisefbo = gl.createFramebuffer()!
const gidenoisetexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, gidenoisetexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const difbo = gl.createFramebuffer()!
const ditexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, ditexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
gl.clearColor(0., 0., 0., 1.0)

const minimap = document.createElement('canvas')
const minimap2d = minimap.getContext('2d')!
const divs = document.querySelectorAll<HTMLElement>('.styled-div')
const scale = 0.5
type SceneItem = {
  bgImage: string | null
  cornerRadius: number
  div: HTMLElement
  fillColor: string
}
const sceneItems: SceneItem[] = Array.from(divs, function(div) {
  const style = getComputedStyle(div)
  const bgImage = style.backgroundImage === 'none' ? null : style.backgroundImage
  return {
    bgImage,
    cornerRadius: parseInt(style.borderRadius, 10) * scale,
    div,
    fillColor: style.backgroundColor,
  }
})

const images: Record<string, HTMLImageElement> = {}
let loadcount = 0
sceneItems.forEach(function(item) {
  if (item.bgImage != null) {
    loadcount++
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = function() {
      images[item.bgImage!] = img
      loadcount--
      if (loadcount === 0) resizeCanvas()
    }
    img.onerror = function() {
      loadcount--
      if (loadcount === 0) resizeCanvas()
    }
    img.src = item.bgImage.slice(4, -1).replace(/['"]/g, '')
  }
})

const minimapTexture = gl.createTexture()!
const maxMinimapMip = 6
const minimapBlurTexture = gl.createTexture()!
const minimapBlurFbo = gl.createFramebuffer()!
let minimapBlurWidth = 0
let minimapBlurHeight = 0
const movingAccumulationAlpha = 0.1
const movingHistorySampleCount = Math.round(1 / movingAccumulationAlpha) - 1

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

const cursorPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
const maxAccumulationFrames = 48
const settleDelayMs = 80
let refinementFrames = 0
let scheduledRaf: number | null = null
// If this demo starts moving boxes around, keep it true while they move.
let sceneIsAnimating = false
let stableAccumulationActive = true
let stableSampleCount = 0
let lastCursorMoveAt = 0

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRaf = null
    if (animate(now)) scheduleRender()
  })
}

function scheduleRefinement() {
  if (needclear < 0) return
  refinementFrames = 0
  scheduleRender()
}

function invalidateScene() {
  if (needclear < 0) return
  needclear = 1
  stableAccumulationActive = true
  stableSampleCount = 0
  scheduleRefinement()
}

function updateCursorPosition(x: number, y: number, time: number) {
  if (cursorPosition.x === x && cursorPosition.y === y) return
  cursorPosition.x = x
  cursorPosition.y = y
  lastCursorMoveAt = time
  stableAccumulationActive = false
  scheduleRefinement()
}

window.addEventListener('mousemove', function(event) {
  updateCursorPosition(event.clientX, event.clientY, event.timeStamp)
})

function ontouch(event: TouchEvent) {
  event.preventDefault()
  const touch = event.touches[0] ?? event.changedTouches[0]
  if (touch == null) return
  updateCursorPosition(touch.clientX, touch.clientY, event.timeStamp)
}
document.documentElement.style.touchAction = 'none'
window.addEventListener('touchstart', ontouch)
window.addEventListener('touchend', ontouch)
window.addEventListener('touchcancel', ontouch)
window.addEventListener('touchmove', ontouch)

let needclear = -1
const canvasres = 1.

function redrawMinimap() {
  const minimapWidth = Math.max(1, Math.floor(window.innerWidth * scale))
  const minimapHeight = Math.max(1, Math.floor(window.innerHeight * scale))
  const minimapSizeChanged = minimap.width !== minimapWidth || minimap.height !== minimapHeight
  if (minimapSizeChanged) {
    minimap.width = minimapWidth
    minimap.height = minimapHeight
  }
  minimap2d.clearRect(0, 0, minimap.width, minimap.height)

  sceneItems.forEach(function(item) {
    const rect = item.div.getBoundingClientRect()
    drawRoundedRect(minimap2d, rect.left * scale + 1, rect.top * scale + 1, rect.width * scale - 2, rect.height * scale - 2, item.cornerRadius * scale, item.bgImage != null ? images[item.bgImage]! : item.fillColor)
  })

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

  gl.useProgram(mipblurprog)
  gl.bindFramebuffer(gl.FRAMEBUFFER, minimapBlurFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, minimapBlurTexture, 0)
  for (let mip = 1; mip <= maxMinimapMip; ++mip) {
    const mipwidth = (minimap.width >> mip) || 1
    const mipheight = (minimap.height >> mip) || 1
    gl.viewport(0, 0, mipwidth, mipheight)
    gl.uniform2f(mipblurCanvasSizeLocation, mipwidth, mipheight)
    gl.uniform1i(mipblurLevelLocation, mip - 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.copyTexSubImage2D(gl.TEXTURE_2D, mip, 0, 0, 0, 0, mipwidth, mipheight)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
}

function refreshScene() {
  redrawMinimap()
  invalidateScene()
}

function resizeCanvas() {
  needclear = 1
  const devicePixelRatio = canvasres
  canvas.width = window.innerWidth * devicePixelRatio
  canvas.height = window.innerHeight * devicePixelRatio
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'

  gl.bindFramebuffer(gl.FRAMEBUFFER, gifbo)
  gl.bindTexture(gl.TEXTURE_2D, gitexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gitexture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, gidenoisefbo)
  gl.bindTexture(gl.TEXTURE_2D, gidenoisetexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gidenoisetexture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, difbo)
  gl.bindTexture(gl.TEXTURE_2D, ditexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ditexture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.useProgram(prog)
  gl.uniform2f(canvasSizeLocation, canvas.width, canvas.height)
  gl.useProgram(diprog)
  gl.uniform2f(dicanvasSizeLocation, canvas.width, canvas.height)

  refreshScene()
}

window.addEventListener('resize', resizeCanvas, false)

// Uniform locations for GI pass
const canvasSizeLocation = gl.getUniformLocation(prog, 'canvasSize')
const accumulationAlphaLocation = gl.getUniformLocation(prog, 'accumulationAlpha')
const cursorPositionLocation = gl.getUniformLocation(prog, 'cursorPosition')
const minimapTextureLocation = gl.getUniformLocation(prog, 'minimapTexture')
const bluenoiseTextureLocation = gl.getUniformLocation(prog, 'bluenoiseTexture')
const lightTextureLocation = gl.getUniformLocation(prog, 'lightTexture')
const noiseOffsetLocation = gl.getUniformLocation(prog, 'noiseOffset')

// Uniform locations for direct illumination pass
const dicanvasSizeLocation = gl.getUniformLocation(diprog, 'canvasSize')
const dicursorPositionLocation = gl.getUniformLocation(diprog, 'cursorPosition')
const diminimapTextureLocation = gl.getUniformLocation(diprog, 'minimapTexture')
const dilightTextureLocation = gl.getUniformLocation(diprog, 'lightTexture')

// Uniform locations for GI denoise pass
const gidenoiseCanvasSizeLocation = gl.getUniformLocation(gidenoiseprog, 'canvasSize')
const gidenoiseGiTextureLocation = gl.getUniformLocation(gidenoiseprog, 'giTexture')
const gidenoiseMinimapTextureLocation = gl.getUniformLocation(gidenoiseprog, 'minimapTexture')

// Uniform locations for final composite
const giTextureLocation = gl.getUniformLocation(finalcompprog, 'giTexture')
const diTextureLocation = gl.getUniformLocation(finalcompprog, 'diTexture')

// Uniform locations for mip blur
const mipblurCanvasSizeLocation = gl.getUniformLocation(mipblurprog, 'canvasSize')
const mipblurTextureLocation = gl.getUniformLocation(mipblurprog, 'minimapTexture')
const mipblurLevelLocation = gl.getUniformLocation(mipblurprog, 'minimapLevel')

gl.useProgram(mipblurprog)
gl.uniform1i(mipblurTextureLocation, 0)

gl.useProgram(prog)
gl.uniform1i(minimapTextureLocation, 0)
gl.uniform1i(bluenoiseTextureLocation, 1)
gl.uniform1i(lightTextureLocation, 2)

gl.useProgram(diprog)
gl.uniform1i(diminimapTextureLocation, 0)
gl.uniform1i(dilightTextureLocation, 2)

gl.useProgram(gidenoiseprog)
gl.uniform1i(gidenoiseMinimapTextureLocation, 0)
gl.uniform1i(gidenoiseGiTextureLocation, 1)

gl.useProgram(finalcompprog)
gl.uniform1i(diTextureLocation, 0)
gl.uniform1i(giTextureLocation, 1)

// R2 quasi-random sequence for well-distributed temporal samples
let frameCount = 0
const R2_A1 = 0.7548776662466927 // 1 / plastic constant
const R2_A2 = 0.5698402909980532 // 1 / plastic constant^2

function animate(now: number) {
  if (needclear < 0) return false
  if (sceneIsAnimating) {
    redrawMinimap()
    lastCursorMoveAt = now
    stableAccumulationActive = false
    needclear = 1
    refinementFrames = 0
  }
  if (!sceneIsAnimating && !stableAccumulationActive && now - lastCursorMoveAt >= settleDelayMs) {
    stableAccumulationActive = true
    stableSampleCount = movingHistorySampleCount
    refinementFrames = 0
  }
  frameCount++

  const noiseX = (0.5 + R2_A1 * frameCount) % 1.0
  const noiseY = (0.5 + R2_A2 * frameCount) % 1.0
  const accumulationAlpha = stableAccumulationActive ? 1 / (stableSampleCount + 1) : movingAccumulationAlpha

  // GI pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, gifbo)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(prog)
  gl.uniform1f(accumulationAlphaLocation, accumulationAlpha)
  gl.uniform2f(noiseOffsetLocation, noiseX, noiseY)
  gl.uniform2f(cursorPositionLocation, cursorPosition.x * canvasres, cursorPosition.y * canvasres)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, ditexture)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bluenoise)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
  gl.enable(gl.BLEND)
  gl.blendEquation(gl.FUNC_ADD)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
  gl.disable(gl.BLEND)

  // GI denoise pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, gidenoisefbo)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(gidenoiseprog)
  gl.uniform2f(gidenoiseCanvasSizeLocation, canvas.width, canvas.height)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, gitexture)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // Direct illumination pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, difbo)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(diprog)
  gl.uniform2f(dicursorPositionLocation, cursorPosition.x * canvasres, cursorPosition.y * canvasres)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, gidenoisetexture)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // Final composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(finalcompprog)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, ditexture)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, gidenoisetexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  if (stableAccumulationActive) stableSampleCount += 1
  refinementFrames += 1
  needclear = 0
  return sceneIsAnimating || !stableAccumulationActive || refinementFrames < maxAccumulationFrames
}

if (loadcount === 0) resizeCanvas()
