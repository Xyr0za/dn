export const vertexShader = /* glsl */ `
  in vec3 position;
  uniform mat4 modelMatrix;
  uniform mat4 modelViewMatrix;
  uniform mat4 projectionMatrix;
  uniform vec3 cameraPosition;

  out vec3 vOrigin;
  out vec3 vDirection;

  void main() {
    vOrigin = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
    vDirection = position - vOrigin;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  precision highp sampler3D;

  in vec3 vOrigin;
  in vec3 vDirection;

  uniform sampler3D u_volume;
  uniform sampler3D u_mask;
  uniform float u_maskOpacity;
  uniform float u_windowMin;
  uniform float u_windowMax;
  uniform vec3 u_flip;

  out vec4 fragColor;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  vec3 labelColor(float id) {
    return fract(sin(vec3(id * 12.9898, id * 78.233, id * 39.346)) * 43758.5453);
  }

  vec2 intersectBox(vec3 orig, vec3 dir) {
    vec3 invDir = 1.0 / dir;
    vec3 t0 = (-0.5 - orig) * invDir;
    vec3 t1 = (0.5 - orig) * invDir;
    vec3 tMin = min(t0, t1);
    vec3 tMax = max(t0, t1);
    return vec2(max(tMin.x, max(tMin.y, tMin.z)), min(tMax.x, min(tMax.y, tMax.z)));
  }

  void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 bounds = intersectBox(vOrigin, rayDir);
    if (bounds.x > bounds.y) discard;

    bounds.x = max(bounds.x, 0.0);
    vec3 p = vOrigin + bounds.x * rayDir;
    
    vec3 inc = 1.0 / abs(rayDir);
    float stepSize = min(inc.x, min(inc.y, min(inc.z, 1.0))) / 250.0;
    vec3 stepVec = rayDir * stepSize;

    p += stepVec * hash(gl_FragCoord.xy);

    float range = max(u_windowMax - u_windowMin, 1.0);
    vec4 acc = vec4(0.0);

    for (int i = 0; i < 500; i++) {
      vec3 uvw = p + 0.5;
      uvw = mix(uvw, 1.0 - uvw, u_flip);

      float density = texture(u_volume, uvw).r;
      float v = clamp((density - u_windowMin) / range, 0.0, 1.0);
      float maskVal = texture(u_mask, uvw).r;

      float a = v * v * 0.15;
      vec3 c = vec3(v);

      if (maskVal > 0.0) {
        float organId = floor(maskVal * 255.0 + 0.5);
        c = mix(c, labelColor(organId), u_maskOpacity);
        a = max(a, u_maskOpacity * 0.05);
      }

      acc.rgb += (1.0 - acc.a) * a * c;
      acc.a   += (1.0 - acc.a) * a;

      if (acc.a > 0.95) break;

      p += stepVec;
      if (any(greaterThan(p, vec3(0.5))) || any(lessThan(p, vec3(-0.5)))) break;
    }

    fragColor = vec4(acc.rgb / max(acc.a, 0.001), acc.a);
  }
`;