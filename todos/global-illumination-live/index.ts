// oxlint-disable no-unnecessary-type-assertion -- tsgo and oxlint disagree on WebGL nullability
// oxlint-disable strict-boolean-expressions -- WebGL getShaderParameter/getProgramParameter return any

type CircleItem = {
  type: 'circle'
  color: string
  radius: number
  x: number
  y: number
}

type RoundedRectItem = {
  type: 'roundedRect'
  color: string
  height: number
  radius: number
  width: number
  x: number
  y: number
}

type TextItem = {
  type: 'text'
  color: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  text: string
  x: number
  y: number
}

type SceneItem = CircleItem | RoundedRectItem | TextItem

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const gl = canvas.getContext('webgl2')!
const sceneCanvas = document.createElement('canvas')
const scene2d = sceneCanvas.getContext('2d')!

const lightingScale = 0.75
const defaultPointer = { x: 0, y: 0 }
const pointer = { x: defaultPointer.x, y: defaultPointer.y }

let sceneWidth = 1
let sceneHeight = 1
let lightingWidth = 1
let lightingHeight = 1
let sceneIsDirty = true
let scheduledRaf: number | null = null

const halfFloatSupported = gl.getExtension('EXT_color_buffer_half_float') != null
const renderTextureInternalFormat = halfFloatSupported ? gl.RGBA16F : gl.RGBA8
const renderTextureType = halfFloatSupported ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE

const fullscreenQuadVertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1])
const fullscreenQuadBuffer = gl.createBuffer()!
gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenQuadBuffer)
gl.bufferData(gl.ARRAY_BUFFER, fullscreenQuadVertices, gl.STATIC_DRAW)

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
  console.error('Vertex shader failed to compile:\n' + gl.getShaderInfoLog(vertexShader))
}

function createFullscreenProgram(fragmentShaderSource: string) {
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!
  gl.shaderSource(fragmentShader, '#version 300 es\n' + fragmentShaderSource)
  gl.compileShader(fragmentShader)
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    console.error('Fragment shader failed to compile:\n' + gl.getShaderInfoLog(fragmentShader))
  }

  const program = gl.createProgram()!
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Shader program failed to link:\n' + gl.getProgramInfoLog(program))
  }

  gl.useProgram(program)
  const positionLocation = gl.getAttribLocation(program, 'position')
  gl.enableVertexAttribArray(positionLocation)
  gl.bindBuffer(gl.ARRAY_BUFFER, fullscreenQuadBuffer)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
  return program
}

const directLightProgram = createFullscreenProgram(`
  precision highp float;
  uniform vec2 sceneSize;
  uniform vec2 cursorPosition;
  uniform sampler2D sceneTexture;
  in vec2 vuv;
  out vec4 color;

  vec4 sampleScene(vec2 uv, float mip) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
    return textureLod(sceneTexture, uv, mip);
  }

  float traceVisibility(vec2 fromPixel, vec2 toPixel) {
    vec2 delta = toPixel - fromPixel;
    float distanceToLight = length(delta);
    if (distanceToLight < 1.0) return 1.0;

    float initialOccupancy = sampleScene(fromPixel / sceneSize, 0.0).a;
    bool leftInitialSurface = initialOccupancy < 0.08;
    float exitThreshold = max(0.03, initialOccupancy * 0.35);
    float visibility = 1.0;
    for (float stepIndex = 0.0; stepIndex < 18.0; stepIndex += 1.0) {
      float t = (stepIndex + 0.5) / 18.0;
      vec2 samplePixel = mix(fromPixel, toPixel, t);
      float occupancy = sampleScene(samplePixel / sceneSize, 0.0).a;
      if (!leftInitialSurface) {
        if (occupancy <= exitThreshold) leftInitialSurface = true;
        continue;
      }
      visibility *= 1.0 - occupancy * 0.78;
      if (visibility < 0.03) return 0.0;
    }
    return visibility;
  }

  void main() {
    vec2 scenePixel = vec2(vuv.x * sceneSize.x, (1.0 - vuv.y) * sceneSize.y);
    vec2 toLight = cursorPosition - scenePixel;
    float lightDistance = length(toLight);
    float visibility = traceVisibility(scenePixel, cursorPosition);
    float falloff = 2.4 / (1.0 + lightDistance * 0.035 + lightDistance * lightDistance * 0.0002);
    float skylight = mix(0.08, 0.03, scenePixel.y / sceneSize.y);
    vec3 direct = visibility * falloff * vec3(1.0, 0.94, 0.84);
    color = vec4(direct + vec3(skylight), 1.0);
  }
`)

const bounceLightProgram = createFullscreenProgram(`
  precision highp float;
  uniform vec2 sceneSize;
  uniform vec2 cursorPosition;
  uniform sampler2D sceneTexture;
  uniform sampler2D directLightTexture;
  in vec2 vuv;
  out vec4 color;

  vec4 sampleScene(vec2 uv, float mip) {
    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec4(0.0);
    return textureLod(sceneTexture, uv, mip);
  }

  vec3 decodeAlbedo(vec4 tap) {
    if (tap.a < 0.0001) return vec3(0.0);
    return clamp(tap.rgb / tap.a, vec3(0.0), vec3(1.0));
  }

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec4 traceSurface(vec2 originPixel, vec2 direction) {
    float travel = 18.0;
    for (float stepIndex = 0.0; stepIndex < 11.0; stepIndex += 1.0) {
      vec2 samplePixel = originPixel + direction * travel;
      vec2 sceneUv = samplePixel / sceneSize;
      float mip = min(5.0, 0.4 + stepIndex * 0.45);
      vec4 tap = sampleScene(sceneUv, mip);
      if (tap.a > 0.14) return vec4(sceneUv, travel, 1.0);
      travel += 12.0 + stepIndex * 11.0;
    }
    return vec4(0.0);
  }

  void main() {
    vec2 scenePixel = vec2(vuv.x * sceneSize.x, (1.0 - vuv.y) * sceneSize.y);
    vec2 sceneUv = scenePixel / sceneSize;
    vec4 sceneTap = sampleScene(sceneUv, 0.0);
    vec3 direct = textureLod(directLightTexture, vuv, 0.0).rgb;
    vec3 blurredDirect = textureLod(directLightTexture, vuv, 1.0).rgb;

    float rotation = hash(floor(scenePixel * 0.5)) * 6.2831853;
    vec3 indirect = vec3(0.0);
    float indirectWeight = 0.0;
    for (float tapIndex = 0.0; tapIndex < 6.0; tapIndex += 1.0) {
      float angle = rotation + tapIndex * 1.0471976;
      vec2 direction = vec2(cos(angle), sin(angle));
      vec4 hit = traceSurface(scenePixel, direction);
      if (hit.w > 0.5) {
        vec4 hitSceneTap = sampleScene(hit.xy, 0.0);
        vec3 hitAlbedo = decodeAlbedo(hitSceneTap);
        vec3 hitDirect = textureLod(directLightTexture, vec2(hit.x, 1.0 - hit.y), 1.0).rgb;
        float distanceWeight = 1.0 / (1.0 + hit.z * 0.02);
        indirect += hitAlbedo * hitDirect * distanceWeight;
        indirectWeight += distanceWeight;
      }
    }
    if (indirectWeight > 0.0) indirect *= 0.9 / indirectWeight;

    vec2 gradientStep = vec2(1.0 / sceneSize.x, 1.0 / sceneSize.y);
    vec2 alphaGradient = vec2(
      sampleScene(sceneUv + vec2(gradientStep.x, 0.0), 0.0).a - sampleScene(sceneUv - vec2(gradientStep.x, 0.0), 0.0).a,
      sampleScene(sceneUv + vec2(0.0, gradientStep.y), 0.0).a - sampleScene(sceneUv - vec2(0.0, gradientStep.y), 0.0).a
    );

    vec3 reflection = vec3(0.0);
    float gradientLength = length(alphaGradient);
    if (sceneTap.a > 0.01 && gradientLength > 0.02) {
      vec2 normal = normalize(-alphaGradient);
      vec2 lightDirection = normalize(cursorPosition - scenePixel);
      float facing = max(0.0, dot(normal, lightDirection));
      vec2 reflectedDirection = reflect(-lightDirection, normal);
      vec4 reflectedHit = traceSurface(scenePixel + reflectedDirection * 12.0, reflectedDirection);
      if (reflectedHit.w > 0.5) {
        vec4 reflectedSceneTap = sampleScene(reflectedHit.xy, 0.0);
        vec3 reflectedAlbedo = decodeAlbedo(reflectedSceneTap);
        vec3 reflectedDirect = textureLod(directLightTexture, vec2(reflectedHit.x, 1.0 - reflectedHit.y), 1.0).rgb;
        reflection = reflectedAlbedo * reflectedDirect * pow(facing, 6.0) * 0.55;
      }
    }

    float nearbySurface = textureLod(sceneTexture, sceneUv, 4.0).a;
    float backgroundBounce = smoothstep(0.02, 0.2, nearbySurface);
    vec3 backdropLight = vec3(0.03, 0.035, 0.05) + blurredDirect * 0.24 + indirect * (0.18 * backgroundBounce);
    vec3 surfaceLight = vec3(0.14) + direct + indirect * 1.15 + reflection;
    color = vec4(mix(backdropLight, surfaceLight, sceneTap.a), 1.0);
  }
`)

const finalCompositeProgram = createFullscreenProgram(`
  precision highp float;
  uniform sampler2D sceneTexture;
  uniform sampler2D lightTexture;
  in vec2 vuv;
  out vec4 color;

  vec3 decodeAlbedo(vec4 tap) {
    if (tap.a < 0.0001) return vec3(0.0);
    return clamp(tap.rgb / tap.a, vec3(0.0), vec3(1.0));
  }

  void main() {
    vec2 sceneUv = vec2(vuv.x, 1.0 - vuv.y);
    vec4 sceneTap = textureLod(sceneTexture, sceneUv, 0.0);
    vec3 albedo = decodeAlbedo(sceneTap);
    vec3 light = textureLod(lightTexture, vuv, 0.0).rgb;
    vec3 backdrop = mix(vec3(0.035, 0.045, 0.07), vec3(0.007, 0.01, 0.018), vuv.y);
    vec3 backgroundColor = backdrop + light * 0.18;
    vec3 surfaceColor = albedo * light;
    vec3 hdr = mix(backgroundColor, surfaceColor, sceneTap.a);
    hdr = hdr / (1.0 + hdr);
    color = vec4(pow(hdr, vec3(1.0 / 2.2)), 1.0);
  }
`)

const sceneTexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const directLightTexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, directLightTexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const bounceLightTexture = gl.createTexture()!
gl.bindTexture(gl.TEXTURE_2D, bounceLightTexture)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

const directLightFbo = gl.createFramebuffer()!
const bounceLightFbo = gl.createFramebuffer()!

const directLightSceneSizeLocation = gl.getUniformLocation(directLightProgram, 'sceneSize')
const directLightCursorLocation = gl.getUniformLocation(directLightProgram, 'cursorPosition')
const directLightSceneTextureLocation = gl.getUniformLocation(directLightProgram, 'sceneTexture')

const bounceLightSceneSizeLocation = gl.getUniformLocation(bounceLightProgram, 'sceneSize')
const bounceLightCursorLocation = gl.getUniformLocation(bounceLightProgram, 'cursorPosition')
const bounceLightSceneTextureLocation = gl.getUniformLocation(bounceLightProgram, 'sceneTexture')
const bounceLightDirectTextureLocation = gl.getUniformLocation(bounceLightProgram, 'directLightTexture')

const finalCompositeSceneTextureLocation = gl.getUniformLocation(finalCompositeProgram, 'sceneTexture')
const finalCompositeLightTextureLocation = gl.getUniformLocation(finalCompositeProgram, 'lightTexture')

gl.useProgram(directLightProgram)
gl.uniform1i(directLightSceneTextureLocation, 0)

gl.useProgram(bounceLightProgram)
gl.uniform1i(bounceLightSceneTextureLocation, 0)
gl.uniform1i(bounceLightDirectTextureLocation, 1)

gl.useProgram(finalCompositeProgram)
gl.uniform1i(finalCompositeSceneTextureLocation, 0)
gl.uniform1i(finalCompositeLightTextureLocation, 1)

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderOnce() {
    scheduledRaf = null
    renderScene()
  })
}

function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + radius, radius)
  context.arcTo(x + width, y + height, x + width - radius, y + height, radius)
  context.arcTo(x, y + height, x, y + height - radius, radius)
  context.arcTo(x, y, x + radius, y, radius)
  context.closePath()
}

function layoutSceneItems(width: number, height: number): SceneItem[] {
  const letterSize = Math.min(width * 0.24, height * 0.42)
  return [
    { type: 'circle', color: '#5bd5ff', radius: Math.min(width, height) * 0.085, x: width * 0.18, y: height * 0.24 },
    { type: 'roundedRect', color: '#ffd166', width: width * 0.22, height: height * 0.11, radius: Math.min(width, height) * 0.035, x: width * 0.71, y: height * 0.18 },
    { type: 'roundedRect', color: '#b48cf2', width: width * 0.26, height: height * 0.12, radius: Math.min(width, height) * 0.04, x: width * 0.43, y: height * 0.79 },
    { type: 'circle', color: '#f58f87', radius: Math.min(width, height) * 0.06, x: width * 0.84, y: height * 0.8 },
    { type: 'text', color: '#ff725e', fontFamily: 'Georgia, serif', fontSize: letterSize, fontWeight: 900, text: 'R', x: width * 0.27, y: height * 0.56 },
    { type: 'text', color: '#7df06f', fontFamily: 'Georgia, serif', fontSize: letterSize, fontWeight: 900, text: 'G', x: width * 0.5, y: height * 0.56 },
    { type: 'text', color: '#5aa8ff', fontFamily: 'Georgia, serif', fontSize: letterSize, fontWeight: 900, text: 'B', x: width * 0.73, y: height * 0.56 },
  ]
}

function drawSceneTexture() {
  sceneCanvas.width = sceneWidth
  sceneCanvas.height = sceneHeight
  scene2d.clearRect(0, 0, sceneWidth, sceneHeight)
  scene2d.textAlign = 'center'
  scene2d.textBaseline = 'middle'

  const sceneItems = layoutSceneItems(sceneWidth, sceneHeight)
  for (const item of sceneItems) {
    scene2d.fillStyle = item.color
    switch (item.type) {
      case 'circle':
        scene2d.beginPath()
        scene2d.arc(item.x, item.y, item.radius, 0, Math.PI * 2)
        scene2d.fill()
        break
      case 'roundedRect':
        roundedRectPath(scene2d, item.x - item.width / 2, item.y - item.height / 2, item.width, item.height, item.radius)
        scene2d.fill()
        break
      case 'text':
        scene2d.font = `${item.fontWeight} ${item.fontSize}px ${item.fontFamily}`
        scene2d.fillText(item.text, item.x, item.y)
        break
    }
  }

  gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas)
  gl.generateMipmap(gl.TEXTURE_2D)
  sceneIsDirty = false
}

function resizeRenderTargets() {
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight

  sceneWidth = viewportWidth
  sceneHeight = viewportHeight
  lightingWidth = Math.max(1, Math.floor(sceneWidth * lightingScale))
  lightingHeight = Math.max(1, Math.floor(sceneHeight * lightingScale))

  canvas.width = sceneWidth
  canvas.height = sceneHeight
  canvas.style.width = sceneWidth + 'px'
  canvas.style.height = sceneHeight + 'px'

  gl.bindTexture(gl.TEXTURE_2D, directLightTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, renderTextureInternalFormat, lightingWidth, lightingHeight, 0, gl.RGBA, renderTextureType, null)

  gl.bindTexture(gl.TEXTURE_2D, bounceLightTexture)
  gl.texImage2D(gl.TEXTURE_2D, 0, renderTextureInternalFormat, lightingWidth, lightingHeight, 0, gl.RGBA, renderTextureType, null)

  if (pointer.x === defaultPointer.x && pointer.y === defaultPointer.y) {
    pointer.x = sceneWidth * 0.5
    pointer.y = sceneHeight * 0.5
  } else {
    pointer.x = Math.min(Math.max(pointer.x, 0), sceneWidth)
    pointer.y = Math.min(Math.max(pointer.y, 0), sceneHeight)
  }

  sceneIsDirty = true
  scheduleRender()
}

function renderScene() {
  if (sceneIsDirty) drawSceneTexture()

  gl.disable(gl.BLEND)
  gl.clearColor(0.0, 0.0, 0.0, 1.0)

  gl.bindFramebuffer(gl.FRAMEBUFFER, directLightFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, directLightTexture, 0)
  gl.viewport(0, 0, lightingWidth, lightingHeight)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(directLightProgram)
  gl.uniform2f(directLightSceneSizeLocation, sceneWidth, sceneHeight)
  gl.uniform2f(directLightCursorLocation, pointer.x, pointer.y)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  gl.bindFramebuffer(gl.FRAMEBUFFER, bounceLightFbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, bounceLightTexture, 0)
  gl.viewport(0, 0, lightingWidth, lightingHeight)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(bounceLightProgram)
  gl.uniform2f(bounceLightSceneSizeLocation, sceneWidth, sceneHeight)
  gl.uniform2f(bounceLightCursorLocation, pointer.x, pointer.y)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, directLightTexture)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)

  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.viewport(0, 0, sceneWidth, sceneHeight)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.useProgram(finalCompositeProgram)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, bounceLightTexture)
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, sceneTexture)
  gl.drawArrays(gl.TRIANGLES, 0, 6)
}

function updatePointer(x: number, y: number) {
  pointer.x = x
  pointer.y = y
  scheduleRender()
}

window.addEventListener('mousemove', function(event) {
  updatePointer(event.clientX, event.clientY)
})

function handleTouch(event: TouchEvent) {
  event.preventDefault()
  const touch = event.touches[0] ?? event.changedTouches[0]
  if (touch == null) return
  updatePointer(touch.clientX, touch.clientY)
}

document.documentElement.style.touchAction = 'none'
window.addEventListener('touchstart', handleTouch)
window.addEventListener('touchmove', handleTouch)
window.addEventListener('touchend', handleTouch)
window.addEventListener('touchcancel', handleTouch)
window.addEventListener('resize', resizeRenderTargets)

resizeRenderTargets()
