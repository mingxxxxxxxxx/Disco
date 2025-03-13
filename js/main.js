/**
 * 迪斯科球与音乐和手势互动应用 - 集成GSAP实现流畅动画
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.133.1/build/three.module';
import { OrbitControls } from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/controls/OrbitControls';
import * as BufferGeometryUtils from 'https://cdn.skypack.dev/three@0.133.1/examples/jsm/utils/BufferGeometryUtils.js';
import HandGestureController from './gesture.js';

// DOM元素选择
const container = document.querySelector('.container');
const discoCanvas = document.getElementById('disco-canvas');
const backgroundCanvas = document.getElementById('background-canvas');
const startBtn = document.getElementById('start-btn');
const gestureIndicator = document.getElementById('gesture-indicator');
const indicatorDot = document.querySelector('.indicator-dot');
const introPanel = document.getElementById('intro-panel');

// 创建一个隐藏的音频元素播放MP3
const audioPlayer = document.createElement('audio');
audioPlayer.loop = true;
audioPlayer.preload = 'auto';
// 注意下面的路径 - 根据你的文件夹结构调整
audioPlayer.src = './media/NeonNightlife.mp3';
document.body.appendChild(audioPlayer);
audioPlayer.style.display = 'none';

// WebGL背景变量
let gl, program, vertices, buffer;
const dpr = window.devicePixelRatio || 1;
let fade = 0;

// 音频分析相关变量
let bassLevel = 0, midLevel = 0, trebleLevel = 0;

// 平滑的音频变量 - GSAP补间
let smoothBassLevel = 0, smoothMidLevel = 0, smoothTrebleLevel = 0, smoothAudioLevel = 0;

// Three.js场景相关变量
let renderer, scene, camera, controls, discoBall, clock, texture;

// 音频处理相关变量
let audioContext, analyser, dataArray;
let audioInitialized = false;

// 手势控制相关变量
let gestureController;
let gestureInitialized = false;
let verticalGesture = 0, horizontalGesture = 0;
let handDetected = false;

// 迪斯科球参数
const baseMirrorSize = 0.055;
const baseMirrorDistance = 0.02;

// 霓虹颜色定义
const neonColors = [
  new THREE.Color(0xFF8000), // 橙色
  new THREE.Color(0x00E0E0), // 青色
  new THREE.Color(0xB030C0)  // 紫色偏粉
];

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 确保所有DOM元素加载完成
  initBackgroundShader();
  initThreeJsScene();
  
  // 初始化手势控制器
  gestureController = new HandGestureController();
  
  // 添加介绍面板动画效果
  animateIntroPanel();
  
  // 窗口大小调整
  window.addEventListener('resize', () => {
    updateThreeJsSize();
    resizeBackgroundCanvas();
  });
});

// 添加介绍面板动画效果
function animateIntroPanel() {
  // 淡入动画
  gsap.from(introPanel, {
    opacity: 0,
    y: -20,
    duration: 1,
    ease: "power3.out"
  });
  
  // 功能区域的交错动画效果
  gsap.from('.feature', {
    opacity: 0,
    y: 20,
    duration: 0.8,
    stagger: 0.2,
    delay: 0.4,
    ease: "back.out(1.4)"
  });
  
  // 添加轻微浮动效果
  gsap.to(introPanel, {
    y: 10,
    duration: 3,
    repeat: -1,
    yoyo: true,
    ease: "sine.inOut"
  });
}

// 点击"Start"按钮激活音频和手势处理
startBtn.addEventListener('click', async () => {
  // 立即隐藏整个介绍面板
  gsap.to(introPanel, {
    opacity: 0,
    scale: 0.95,
    duration: 0.5,
    ease: "power2.out",
    onStart: () => {
      startBtn.disabled = true;
    },
    onComplete: () => {
      introPanel.style.display = 'none';
    }
  });
  
  // 初始化音频
  if (!audioInitialized) {
    try {
      await initAudio();
      audioInitialized = true;
    } catch (error) {
      console.error("音频初始化失败:", error);
    }
  } else if (audioContext && audioContext.state === 'suspended') {
    await audioContext.resume();
    audioPlayer.play();
  }
  
  // 手势初始化
  if (!gestureInitialized) {
    try {
      await gestureController.initialize();
      gestureInitialized = true;
      gestureController.start(handleGestureUpdate);
      gestureIndicator.classList.remove('hidden');
    } catch (error) {
      console.error('手势控制初始化失败:', error);
      gestureInitialized = false;
    }
  }
});

/**
 * 处理手势更新
 */
function handleGestureUpdate(gestureData) {
  handDetected = gestureData.handPresent;
  
  // 更新状态指示器
  if (handDetected) {
    indicatorDot.classList.add('active');
    
    // 添加视觉反馈 - 显示当前手势方向
    if (Math.abs(gestureData.verticalMovement) > 0.2 || Math.abs(gestureData.horizontalMovement) > 0.2) {
      // 计算一个简单的方向指示，并添加到指示器文本
      let direction = '';
      if (Math.abs(gestureData.verticalMovement) > 0.2) {
        direction += gestureData.verticalMovement > 0 ? '↑' : '↓';
      }
      if (Math.abs(gestureData.horizontalMovement) > 0.2) {
        direction += gestureData.horizontalMovement > 0 ? '→' : '←';
      }
      
      // 更新手势指示器文本
      const indicatorText = document.querySelector('#gesture-indicator span');
      if (indicatorText) {
        indicatorText.textContent = `Hand Tracking ${direction}`;
      }
    } else {
      // 恢复默认文本
      const indicatorText = document.querySelector('#gesture-indicator span');
      if (indicatorText) {
        indicatorText.textContent = 'Hand Tracking';
      }
    }
  } else {
    indicatorDot.classList.remove('active');
    // 恢复默认文本
    const indicatorText = document.querySelector('#gesture-indicator span');
    if (indicatorText) {
      indicatorText.textContent = 'Hand Tracking';
    }
  }
  
  // 更新手势数据，用于球体控制
  verticalGesture = gestureData.verticalMovement;
  horizontalGesture = gestureData.horizontalMovement;
  
  // 如果检测到明显的手势，给球体一个快速的视觉反馈
  if (handDetected && (Math.abs(verticalGesture) > 0.4 || Math.abs(horizontalGesture) > 0.4)) {
    if (discoBall) {
      // 添加短暂的颜色脉冲效果，使手势更明显
      const pulseColor = new THREE.Color(
        Math.abs(horizontalGesture) > 0.4 ? 0.8 : 0.2,
        0.2,
        Math.abs(verticalGesture) > 0.4 ? 0.8 : 0.2
      );
      
      // 找到内球体材质
      if (discoBall.userData && discoBall.userData.innerMesh) {
        const innerMesh = discoBall.userData.innerMesh;
        const originalEmissive = innerMesh.material.emissive.clone();
        
        // 创建短暂的脉冲效果
        gsap.to(innerMesh.material.emissive, {
          r: pulseColor.r,
          g: pulseColor.g,
          b: pulseColor.b,
          duration: 0.3,
          ease: "power2.out",
          onComplete: () => {
            gsap.to(innerMesh.material.emissive, {
              r: originalEmissive.r,
              g: originalEmissive.g,
              b: originalEmissive.b,
              duration: 0.5,
              ease: "power2.in"
            });
          }
        });
      }
    }
  }
}

async function initAudio() {
  try {
    // 创建音频上下文
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // 创建分析器
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    // 创建媒体元素源
    const source = audioContext.createMediaElementSource(audioPlayer);
    
    // 连接：源 -> 分析器 -> 输出
    source.connect(analyser);
    analyser.connect(audioContext.destination);
    
    // 播放音频
    await audioPlayer.play();
    
    // 添加场景动画效果
    gsap.fromTo(scene.position, 
      { y: -0.2 }, 
      { y: 0, duration: 0.8, ease: "elastic.out(1, 0.7)" }
    );
    
    return true;
  } catch (err) {
    console.error("音频初始化失败:", err);
    throw err;
  }
}

function initThreeJsScene() {
  // 渲染器
  renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    canvas: discoCanvas
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  
  // 场景
  scene = new THREE.Scene();
  
  // 相机
  camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 2;
  
  // 控制器
  controls = new OrbitControls(camera, container);
  controls.minDistance = 1;
  controls.maxDistance = 5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 6;
  controls.enableZoom = false;
  controls.enableDamping = true;
  
  // 添加环境光
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);
  
  // 添加霓虹灯
  neonColors.forEach((color, index) => {
    const angle = (index / neonColors.length) * Math.PI * 2;
    const distance = 2;
    
    const light = new THREE.PointLight(color, 0.6, 4);
    
    light.position.set(
      Math.cos(angle) * distance,
      Math.sin(angle) * distance,
      0
    );
    
    light.userData = {
      initialAngle: angle,
      distance: distance,
      color: color.clone(),
      originalIntensity: 0.6
    };
    
    scene.add(light);
    
    // 初始灯光动画
    gsap.from(light.position, {
      x: 0,
      y: 0,
      z: 0,
      duration: 2,
      delay: index * 0.2,
      ease: "elastic.out(1, 0.3)"
    });
    
    gsap.from(light, {
      intensity: 0,
      duration: 1.5,
      delay: index * 0.2,
      ease: "power2.out"
    });
  });

  // 时钟
  clock = new THREE.Clock();

  // 互动区域
  const element = document.createElement('div');
  element.className = 'overlay-block';
  container.appendChild(element);

  // 加载材质贴图，创建球体
  new THREE.TextureLoader().load(
    'https://assets.codepen.io/959327/matcap-crystal.png',
    (loadedTexture) => {
      texture = loadedTexture;
      
      // 创建迪斯科球
      discoBall = createDiscoBall(
        new THREE.IcosahedronGeometry(0.4, 5),
        baseMirrorSize
      );
      
      scene.add(discoBall);
      
      // 初始缩放为0，使用GSAP创建出场动画
      discoBall.scale.set(0, 0, 0);
      gsap.to(discoBall.scale, {
        x: 1,
        y: 1,
        z: 1,
        duration: 1.5,
        ease: "elastic.out(1, 0.3)",
        delay: 0.5
      });
      
      updateThreeJsSize();
      renderThreeJs();
    }
  );
}

function createDiscoBall(geometry, mirrorSize) {
  const dummy = new THREE.Object3D();

  // 创建镜面材质 - 完全恢复原始代码的设置
  const mirrorMaterial = new THREE.MeshPhongMaterial({
    matcap: texture,
    color: 0xffffff,
    emissive: 0x333333,
    shininess: 90,
    reflectivity: 3.0
  });

  // 处理几何体
  let geometryOriginal = geometry;
  geometryOriginal.deleteAttribute('normal');
  geometryOriginal.deleteAttribute('uv');
  geometryOriginal = BufferGeometryUtils.mergeVertices(geometryOriginal);
  geometryOriginal.computeVertexNormals();

  // 创建镜面
  const mirrorGeometry = new THREE.PlaneGeometry(mirrorSize, mirrorSize);
  
  let instancedMirrorMesh = new THREE.InstancedMesh(
    mirrorGeometry,
    mirrorMaterial,
    geometryOriginal.attributes.position.count
  );

  // 获取顶点和法线数据
  const positions = geometryOriginal.attributes.position.array;
  const normals = geometryOriginal.attributes.normal.array;
  
  const positionsArray = [];
  const normalsArray = [];
  
  // 设置每个镜面位置
  for (let i = 0; i < positions.length; i += 3) {
    positionsArray.push(new THREE.Vector3(positions[i], positions[i + 1], positions[i + 2]));
    normalsArray.push(new THREE.Vector3(normals[i], normals[i + 1], normals[i + 2]));
    
    dummy.position.set(
      positions[i] + normals[i] * baseMirrorDistance,
      positions[i + 1] + normals[i + 1] * baseMirrorDistance,
      positions[i + 2] + normals[i + 2] * baseMirrorDistance
    );
    
    dummy.lookAt(
      positions[i] + normals[i] * (baseMirrorDistance + 1),
      positions[i + 1] + normals[i + 1] * (baseMirrorDistance + 1),
      positions[i + 2] + normals[i + 2] * (baseMirrorDistance + 1)
    );
    
    dummy.updateMatrix();
    instancedMirrorMesh.setMatrixAt(i / 3, dummy.matrix);
  }

  // 创建球体组
  const obj = new THREE.Group();
  
  // 创建内球体 - 完全恢复原始代码
  const innerGeometry = geometryOriginal.clone();
  
  const ballInnerMaterial = new THREE.MeshPhongMaterial({ 
    color: 0x222222,
    emissive: 0x555555,
    shininess: 30
  });
  
  const innerMesh = new THREE.Mesh(innerGeometry, ballInnerMaterial);
  
  // 组装
  obj.add(innerMesh, instancedMirrorMesh);

  // 保存重要数据
  obj.userData = {
    instancedMesh: instancedMirrorMesh,
    innerMesh: innerMesh,
    positions: positionsArray,
    normals: normalsArray,
    originalMirrorSize: mirrorSize,
    mirrorDistance: baseMirrorDistance,
    dummy: dummy
  };
  
  return obj;
}

function renderThreeJs() {
  // 音频分析和处理
  let scaleFactor = 1;
  let audioLevel = 0;
  let bassFactor = 0;
  let midFactor = 0;
  let trebleFactor = 0;

  if (analyser && audioContext && audioContext.state === 'running') {
    // 获取频谱数据
    analyser.getByteFrequencyData(dataArray);
    const numBins = dataArray.length;
    let totalSum = 0;
    
    // 划分频率范围
    const bassRange = Math.floor(numBins * 0.25);  // 低频
    const midRange = Math.floor(numBins * 0.5);    // 中频
    const trebleRange = numBins;                   // 高频
    
    let bassSum = 0, midSum = 0, trebleSum = 0;
    
    // 计算各频段能量
    for (let i = 0; i < bassRange; i++) {
      bassSum += dataArray[i];
      totalSum += dataArray[i];
    }
    
    for (let i = bassRange; i < midRange; i++) {
      midSum += dataArray[i];
      totalSum += dataArray[i];
    }
    
    for (let i = midRange; i < trebleRange; i++) {
      trebleSum += dataArray[i];
      totalSum += dataArray[i];
    }
    
    // 归一化为0-1范围
    bassFactor = bassSum / (bassRange * 256);
    midFactor = midSum / ((midRange - bassRange) * 256);
    trebleFactor = trebleSum / ((trebleRange - midRange) * 256);
    
    const avgLevel = totalSum / numBins;
    audioLevel = avgLevel / 256;
    
    // 检查音量是否为0或极低
    const isSilent = audioLevel < 0.01;
    
    // 只有在有声音时才更新各个参数
    if (!isSilent) {
      // 使用GSAP平滑过渡音频值
      gsap.to({ 
        smoothBass: smoothBassLevel, 
        smoothMid: smoothMidLevel, 
        smoothTreble: smoothTrebleLevel,
        smoothAudio: smoothAudioLevel
      }, {
        smoothBass: bassFactor,
        smoothMid: midFactor, 
        smoothTreble: trebleFactor,
        smoothAudio: audioLevel,
        duration: 0.15,
        ease: "power2.out",
        onUpdate: function() {
          smoothBassLevel = this.targets()[0].smoothBass;
          smoothMidLevel = this.targets()[0].smoothMid;
          smoothTrebleLevel = this.targets()[0].smoothTreble;
          smoothAudioLevel = this.targets()[0].smoothAudio;
        }
      });
    } else {
      // 如果静音，则所有值逐渐降至0
      gsap.to({ 
        smoothBass: smoothBassLevel, 
        smoothMid: smoothMidLevel, 
        smoothTreble: smoothTrebleLevel,
        smoothAudio: smoothAudioLevel
      }, {
        smoothBass: 0,
        smoothMid: 0, 
        smoothTreble: 0,
        smoothAudio: 0,
        duration: 0.5,
        ease: "power2.out",
        onUpdate: function() {
          smoothBassLevel = this.targets()[0].smoothBass;
          smoothMidLevel = this.targets()[0].smoothMid;
          smoothTrebleLevel = this.targets()[0].smoothTreble;
          smoothAudioLevel = this.targets()[0].smoothAudio;
        }
      });
    }
    
    // 更新缩放因子
    scaleFactor = 1 + smoothAudioLevel * 0.5;
    
    // 更新背景淡出效果和着色器变量
    fade = Math.max(0, Math.min(1, smoothAudioLevel));
    bassLevel = smoothBassLevel;
    midLevel = smoothMidLevel;
    trebleLevel = smoothTrebleLevel;
  }

  // 更新灯光
  scene.children.forEach(child => {
    if (child instanceof THREE.PointLight && child.userData) {
      const time = clock.getElapsedTime();
      
      // 平滑旋转角度
      const targetAngle = child.userData.initialAngle + time * 0.3;
      const currentAngle = child.userData.currentAngle || child.userData.initialAngle;
      
      child.userData.currentAngle = gsap.utils.interpolate(
        currentAngle,
        targetAngle,
        0.05
      );
      
      // 创建脉冲效果
      const pulseFactor = 0.3 * Math.sin(time * 2.0 + child.userData.initialAngle);
      
      // 更新位置
      const angle = child.userData.currentAngle;
      gsap.to(child.position, {
        x: Math.cos(angle) * child.userData.distance,
        y: Math.sin(angle) * child.userData.distance,
        duration: 0.2,
        ease: "power1.out",
        overwrite: "auto"
      });
      
      // 更新强度 - 基于音频
      const targetIntensity = smoothAudioLevel > 0 
        ? child.userData.originalIntensity + smoothAudioLevel * 0.8 + pulseFactor
        : child.userData.originalIntensity + pulseFactor;
          
      gsap.to(child, {
        intensity: targetIntensity,
        duration: 0.3,
        ease: "power2.out",
        overwrite: "auto"
      });
    }
  });

  // 更新控制器
  controls.update();

  // 计算动画增量
  const delta = 0.1 * clock.getDelta();

  // 更新迪斯科球
  if (discoBall) {
    // 基础旋转速度
    let baseRotationSpeed = {
      x: 0.5 + smoothBassLevel * 0.3,
      y: 0.7 + smoothMidLevel * 0.2
    };
    
    // 手势控制逻辑
    if (gestureInitialized && handDetected) {
      // 1. 左右手势控制Y轴旋转速度
      if (horizontalGesture > 0.1) {
        // 右移：加速
        const accelerateFactor = 1 + horizontalGesture * 2;
        baseRotationSpeed.y *= accelerateFactor;
      } 
      else if (horizontalGesture < -0.1) {
        // 左移：减速
        const decelerateFactor = 1 - Math.abs(horizontalGesture) * 0.8;
        baseRotationSpeed.y *= Math.max(0.2, decelerateFactor);
      }
      
      // 2. 上下手势控制X轴旋转
      const verticalRotation = verticalGesture * 0.1;
      const jitter = (Math.random() - 0.5) * 0.01;
      
      gsap.to(discoBall.rotation, {
        x: discoBall.rotation.x + verticalRotation + jitter,
        duration: 0.1,
        ease: "power1.out",
        overwrite: "auto"
      });
    }
    
    // 平滑旋转动画
    gsap.to(discoBall.rotation, {
      y: discoBall.rotation.y + delta * baseRotationSpeed.y,
      duration: 0.1,
      ease: "linear",
      overwrite: "auto"
    });
    
    // 平滑缩放动画
    gsap.to(discoBall.scale, {
      x: scaleFactor,
      y: scaleFactor,
      z: scaleFactor,
      duration: 0.2,
      ease: "power2.out",
      overwrite: "auto"
    });
    
    // 更新镜面
    if (discoBall.userData && discoBall.userData.instancedMesh) {
      const userData = discoBall.userData;
      const instancedMesh = userData.instancedMesh;
      const dummy = userData.dummy || new THREE.Object3D();
      
      // 平滑调整镜面大小 - 高频影响
      const targetMirrorSize = userData.originalMirrorSize * (1 + smoothTrebleLevel * 0.25);
      userData.currentMirrorSize = userData.currentMirrorSize || userData.originalMirrorSize;
      
      userData.currentMirrorSize = gsap.utils.interpolate(
        userData.currentMirrorSize,
        targetMirrorSize,
        0.15
      );
      
      // 平滑调整镜面距离 - 中频影响
      const targetDistance = userData.mirrorDistance + smoothMidLevel * 0.05;
      userData.currentDistance = userData.currentDistance || userData.mirrorDistance;
      
      userData.currentDistance = gsap.utils.interpolate(
        userData.currentDistance,
        targetDistance,
        0.15
      );
      
      // 更新几何体
      const newMirrorGeometry = new THREE.PlaneGeometry(
        userData.currentMirrorSize, 
        userData.currentMirrorSize
      );
      instancedMesh.geometry.dispose();
      instancedMesh.geometry = newMirrorGeometry;
      
      // 更新每个镜面
      for (let i = 0; i < userData.positions.length; i++) {
        const pos = userData.positions[i];
        const norm = userData.normals[i];
        
        dummy.position.set(
          pos.x + norm.x * userData.currentDistance,
          pos.y + norm.y * userData.currentDistance,
          pos.z + norm.z * userData.currentDistance
        );
        
        dummy.lookAt(
          pos.x + norm.x * (userData.currentDistance + 1),
          pos.y + norm.y * (userData.currentDistance + 1),
          pos.z + norm.z * (userData.currentDistance + 1)
        );
        
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(i, dummy.matrix);
      }
      
      instancedMesh.instanceMatrix.needsUpdate = true;
      
      // 更新球体颜色 - 创建动态彩色效果
      if (userData.innerMesh && userData.innerMesh.material) {
        const time = clock.getElapsedTime() * 0.2;
        const colorIndex = Math.floor(time % 3);
        const nextColorIndex = (colorIndex + 1) % 3;
        const lerpFactor = (time % 1);
        
        // 在霓虹色之间平滑过渡
        const emissiveColor = new THREE.Color();
        emissiveColor.lerpColors(
          neonColors[colorIndex], 
          neonColors[nextColorIndex], 
          lerpFactor
        );
        
        // 发光强度随音频变化
        const emissiveIntensity = 0.1 * smoothAudioLevel;
        
        gsap.to(userData.innerMesh.material.emissive, {
          r: emissiveColor.r * emissiveIntensity,
          g: emissiveColor.g * emissiveIntensity,
          b: emissiveColor.b * emissiveIntensity,
          duration: 0.3,
          ease: "power2.out"
        });
        
        // 低频强脉冲效果
        if (smoothBassLevel > 0.7) {
          gsap.to(userData.innerMesh.scale, {
            x: 1.05,
            y: 1.05,
            z: 1.05,
            duration: 0.1,
            ease: "power1.out",
            yoyo: true,
            repeat: 1,
            overwrite: "auto"
          });
        }
      }
    }
  }

  // 渲染场景
  renderer.render(scene, camera);
  
  // 请求下一帧动画
  requestAnimationFrame(renderThreeJs);
}

function updateThreeJsSize() {
  if (!camera || !renderer) return;
  
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function initBackgroundShader() {
  gl = backgroundCanvas.getContext("webgl2");
  if (!gl) {
    console.error("您的浏览器不支持WebGL2");
    return;
  }

  // 编译顶点着色器
  const vs = gl.createShader(gl.VERTEX_SHADER);
  const vertexSource = document.querySelector('script[type="x-shader/x-vertex"]').innerText;
  gl.shaderSource(vs, vertexSource);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(vs));
  }

  // 编译片段着色器
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  const fragmentSource = document.querySelector('script[type="x-shader/x-fragment"]').innerText;
  gl.shaderSource(fs, fragmentSource);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(fs));
  }

  // 创建程序
  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }

  // 设置顶点
  vertices = [-1, -1, 1, -1, -1, 1, 1, 1];
  buffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  // 获取uniform位置
  program.resolution = gl.getUniformLocation(program, "resolution");
  program.time = gl.getUniformLocation(program, "time");
  program.fade = gl.getUniformLocation(program, "fade");
  program.bassLevel = gl.getUniformLocation(program, "bassLevel");
  program.midLevel = gl.getUniformLocation(program, "midLevel");
  program.trebleLevel = gl.getUniformLocation(program, "trebleLevel");
  
  // 调整尺寸并开始渲染
  resizeBackgroundCanvas();
  renderBackground(0);
}

function renderBackground(now) {
  if (!gl || !program) {
    requestAnimationFrame(renderBackground);
    return;
  }
  
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

  // 设置uniform变量
  gl.uniform2f(program.resolution, backgroundCanvas.width, backgroundCanvas.height);
  gl.uniform1f(program.time, now * 1e-3);  // 转换为秒
  gl.uniform1f(program.fade, fade);
  
  // 传递音频数据到着色器
  gl.uniform1f(program.bassLevel, bassLevel);
  gl.uniform1f(program.midLevel, midLevel);
  gl.uniform1f(program.trebleLevel, trebleLevel);

  // 绘制背景
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  // 请求下一帧
  requestAnimationFrame(renderBackground);
}

function resizeBackgroundCanvas() {
  if (!gl || !backgroundCanvas) return;
  
  // 调整大小，考虑设备像素比
  const { innerWidth: width, innerHeight: height } = window;
  backgroundCanvas.width = width * dpr;
  backgroundCanvas.height = height * dpr;
  gl.viewport(0, 0, width * dpr, height * dpr);
  
  // 重置大小时添加动画效果
  if (scene && scene.scale) {
    gsap.from(scene.scale, {
      x: 0.8,
      y: 0.8,
      z: 0.8,
      duration: 0.5,
      ease: "elastic.out(1, 0.7)"
    });
  }
}

// 窗口失焦时优化性能
window.addEventListener('blur', () => {
  if (controls) {
    controls.autoRotateSpeed = 1;  // 降低旋转速度
  }
  
  // 如果启用了手势追踪，暂停它以节省资源
  if (gestureInitialized && gestureController) {
    gestureController.stop();
  }
  
  // 如果音频在播放，暂停它
  if (audioPlayer && !audioPlayer.paused) {
    audioPlayer.pause();
  }
});

// 窗口获得焦点时恢复性能
window.addEventListener('focus', () => {
  if (controls) {
    controls.autoRotateSpeed = 6;  // 恢复旋转速度
    
    // 添加焦点恢复动画
    gsap.fromTo(scene.rotation, 
      { y: scene.rotation.y - 0.2 }, 
      { y: scene.rotation.y, duration: 0.8, ease: "elastic.out(1, 0.5)" }
    );
  }
  
  // 如果之前启用了手势追踪，恢复它
  if (gestureInitialized && gestureController) {
    gestureController.start(handleGestureUpdate);
  }
  
  // 如果音频已初始化，恢复播放
  if (audioInitialized && audioPlayer) {
    audioPlayer.play();
  }
});

// 页面加载完成时添加淡入效果
window.addEventListener('load', () => {
  if (!gl) {
    initBackgroundShader();
  }
  
  gsap.from('body', { 
    opacity: 0, 
    duration: 1.2,
    ease: "power2.out" 
  });
});