// thanks Alex Evans
// oxlint-disable no-unnecessary-type-assertion -- tsgo and oxlint disagree on WebGL nullability
// oxlint-disable strict-boolean-expressions -- WebGL getShaderParameter/getProgramParameter return any

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const gl = canvas.getContext('webgl2')!

// White noise texture + R2 temporal sequence for good distribution
const bluenoise = gl.createTexture()!
;(function generateNoise() {
  const size = 512
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 256 | 0
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

// Direct illumination: trace toward cursor light
const diprog = make_fullscreen_program(`
  precision mediump float;
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
    color = vec4(c, 0.1);
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

const difbo = gl.createFramebuffer()!
const ditexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, ditexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const minimap = document.createElement('canvas')
const minimap2d = minimap.getContext('2d')!
const divs = document.querySelectorAll('.styled-div')
const scale = 0.5

const images: Record<string, HTMLImageElement> = {}
let loadcount = 0
divs.forEach(function(div) {
  const bg = getComputedStyle(div).backgroundImage
  if (bg !== 'none') {
    loadcount++
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = bg.slice(4, -1).replace(/['"]/g, '')
    img.onload = function() {
      images[bg] = img
      loadcount--
      if (loadcount === 0) resizeCanvas()
    }
  }
})

const minimapTexture = gl.createTexture()!
const cursorPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

window.addEventListener('mousemove', function(event) {
  cursorPosition.x = event.clientX
  cursorPosition.y = event.clientY
})

function ontouch(event: TouchEvent) {
  event.preventDefault()
  if (event.touches.length > 0) {
    cursorPosition.x = event.touches[0]!.clientX
    cursorPosition.y = event.touches[0]!.clientY
  }
}
document.documentElement.style.touchAction = 'none'
window.addEventListener('touchstart', ontouch)
window.addEventListener('touchend', ontouch)
window.addEventListener('touchmove', ontouch)

let needclear = -1
const canvasres = 1.

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

  gl.bindFramebuffer(gl.FRAMEBUFFER, difbo)
  gl.bindTexture(gl.TEXTURE_2D, ditexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, canvas.width, canvas.height, 0, gl.RGBA, gl.HALF_FLOAT, null)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ditexture, 0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)

  minimap.width = window.innerWidth * scale
  minimap.height = window.innerHeight * scale
  minimap2d.clearRect(0, 0, minimap.width, minimap.height)

  divs.forEach(function(div) {
    const rect = div.getBoundingClientRect()
    const style = getComputedStyle(div)
    const cornerRadius = parseInt(style.borderRadius, 10) * scale
    const fillColor = style.backgroundColor
    const bgImage = style.backgroundImage
    drawRoundedRect(minimap2d, rect.left * scale + 1, rect.top * scale + 1, rect.width * scale - 2, rect.height * scale - 2, cornerRadius * scale, bgImage !== 'none' ? images[bgImage]! : fillColor)
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
  const csl = gl.getUniformLocation(mipblurprog, 'canvasSize')
  const mtl = gl.getUniformLocation(mipblurprog, 'minimapTexture')
  const mll = gl.getUniformLocation(mipblurprog, 'minimapLevel')
  for (let mip = 1; mip <= maxmip; ++mip) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, extraTexture, 0)
    const mipwidth = (minimap.width >> mip) || 1
    const mipheight = (minimap.height >> mip) || 1
    gl.viewport(0, 0, mipwidth, mipheight)
    gl.uniform2f(csl, mipwidth, mipheight)
    gl.uniform1i(mtl, 0)
    gl.uniform1i(mll, mip - 1)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbo)
    gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
    gl.copyTexSubImage2D(gl.TEXTURE_2D, mip, 0, 0, 0, 0, mipwidth, mipheight)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }
  animate()
}

window.addEventListener('resize', resizeCanvas, false)

// Uniform locations for GI pass
const canvasSizeLocation = gl.getUniformLocation(prog, 'canvasSize')
const cursorPositionLocation = gl.getUniformLocation(prog, 'cursorPosition')
const minimapTextureLocation = gl.getUniformLocation(prog, 'minimapTexture')
const bluenoiseTextureLocation = gl.getUniformLocation(prog, 'bluenoiseTexture')
const lightTextureLocation = gl.getUniformLocation(prog, 'lightTexture')
const noiseOffsetLocation = gl.getUniformLocation(prog, 'noiseOffset')

// Uniform locations for direct illumination pass
const dicanvasSizeLocation = gl.getUniformLocation(diprog, 'canvasSize')
const dicursorPositionLocation = gl.getUniformLocation(diprog, 'cursorPosition')
const diminimapTextureLocation = gl.getUniformLocation(diprog, 'minimapTexture')
const dibluenoiseTextureLocation = gl.getUniformLocation(diprog, 'bluenoiseTexture')
const dilightTextureLocation = gl.getUniformLocation(diprog, 'lightTexture')
const dinoiseOffsetLocation = gl.getUniformLocation(diprog, 'noiseOffset')

// R2 quasi-random sequence for well-distributed temporal samples
let frameCount = 0
const R2_A1 = 0.7548776662466927 // 1 / plastic constant
const R2_A2 = 0.5698402909980532 // 1 / plastic constant^2

function animate() {
  if (needclear < 0) return
  frameCount++

  gl.clearColor(0., 0., 0., 1.0)

  const noiseX = (0.5 + R2_A1 * frameCount) % 1.0
  const noiseY = (0.5 + R2_A2 * frameCount) % 1.0

  // GI pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, gifbo)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(prog)
  gl.uniform2f(noiseOffsetLocation, noiseX, noiseY)
  gl.uniform2f(canvasSizeLocation, canvas.width, canvas.height)
  gl.uniform2f(cursorPositionLocation, cursorPosition.x * canvasres, cursorPosition.y * canvasres)
  gl.uniform1i(minimapTextureLocation, 0)
  gl.uniform1i(bluenoiseTextureLocation, 1)
  gl.uniform1i(lightTextureLocation, 2)
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

  // Direct illumination pass
  gl.bindFramebuffer(gl.FRAMEBUFFER, difbo)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(diprog)
  gl.uniform2f(dinoiseOffsetLocation, noiseX + 0.5, noiseY + 0.5)
  gl.uniform2f(dicanvasSizeLocation, canvas.width, canvas.height)
  gl.uniform2f(dicursorPositionLocation, cursorPosition.x * canvasres, cursorPosition.y * canvasres)
  gl.uniform1i(diminimapTextureLocation, 0)
  gl.uniform1i(dibluenoiseTextureLocation, 1)
  gl.uniform1i(dilightTextureLocation, 2)
  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, gitexture)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bluenoise)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, minimapTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  // Final composite
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, canvas.width, canvas.height)
  if (needclear !== 0) gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(finalcompprog)
  const giTextureLocation = gl.getUniformLocation(finalcompprog, 'giTexture')
  gl.uniform1i(giTextureLocation, 1)
  const diTextureLocation = gl.getUniformLocation(finalcompprog, 'diTexture')
  gl.uniform1i(diTextureLocation, 0)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, ditexture)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, gitexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  needclear = 0
  requestAnimationFrame(animate)
}

if (loadcount === 0) resizeCanvas()
