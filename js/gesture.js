/**
 * 手势交互模块 - 使用简单光流检测实现手势交互
 * 实现上下滑动控制球体上下旋转，左右滑动控制球体自身旋转速度
 */

class HandGestureController {
  constructor() {
    // 基本变量
    this.video = null;
    this.videoCanvas = null;
    this.videoContext = null;
    this.isRunning = false;
    this.lastFrameGray = null;
    this.currentFrameGray = null;
    
    // 运动检测变量
    this.motionX = 0;
    this.motionY = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.handPresent = false;
    
    // 平滑数据
    this.verticalMovement = 0;     // 上下移动的值 (-1到1)
    this.horizontalMovement = 0;   // 左右移动的值 (-1到1)
    this.movementSpeed = { x: 0, y: 0 }; // 移动速度
    
    // 平滑因子
    this.smoothingFactor = 0.85;
    
    // 回调函数
    this.onHandUpdate = null;
    
    // 检测阈值
    this.motionThreshold = 10;  // 检测运动的阈值
  }
  
  /**
   * 初始化手势识别
   * @returns {Promise} 初始化完成的Promise
   */
  async initialize() {
    try {
      // 创建视频元素
      this.video = document.createElement('video');
      this.video.setAttribute('playsinline', '');
      this.video.style.position = 'absolute';
      this.video.style.top = '0';
      this.video.style.left = '0';
      this.video.style.width = '160px';
      this.video.style.height = '120px';
      this.video.style.opacity = '0';  // 完全隐藏
      this.video.style.zIndex = '-1';  // 放在最底层
      this.video.style.pointerEvents = 'none'; // 忽略鼠标事件
      document.body.appendChild(this.video);
      
      // 创建用于处理视频的隐藏Canvas
      this.videoCanvas = document.createElement('canvas');
      this.videoCanvas.width = 160;
      this.videoCanvas.height = 120;
      this.videoCanvas.style.display = 'none';
      document.body.appendChild(this.videoCanvas);
      this.videoContext = this.videoCanvas.getContext('2d', { willReadFrequently: true });
      
      // 请求摄像头访问权限
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: 160,
          height: 120,
          facingMode: 'user'
        }
      });
      
      this.video.srcObject = stream;
      
      // 等待视频加载
      return new Promise((resolve) => {
        this.video.onloadedmetadata = () => {
          this.video.play();
          console.log("视频流已启动");
          resolve(true);
        };
      });
    } catch (error) {
      console.error('手势识别初始化失败:', error);
      return Promise.reject(error);
    }
  }
  
  /**
   * 开始手势追踪
   */
  start(callback) {
    this.isRunning = true;
    this.onHandUpdate = callback;
    this.detectMotion();
    return true;
  }
  
  /**
   * 停止手势追踪
   */
  stop() {
    this.isRunning = false;
  }
  
  /**
   * 计算图像的平均亮度 - 简单的存在性检测
   */
  calculateAverageBrightness(imageData) {
    const data = imageData.data;
    let sum = 0;
    
    // 每隔4个像素采样一次以提高性能
    for (let i = 0; i < data.length; i += 16) {
      // 灰度值 = 0.299*R + 0.587*G + 0.114*B
      sum += (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
    
    return sum / (data.length / 16);
  }
  
  /**
   * 计算两帧之间的运动差异
   */
  calculateMotion() {
    if (!this.lastFrameGray || !this.currentFrameGray) return { x: 0, y: 0 };
    
    // 改进的区域比较，将画面分为5x5的网格以获得更精确的运动
    const width = this.videoCanvas.width;
    const height = this.videoCanvas.height;
    const blockWidth = Math.floor(width / 5);
    const blockHeight = Math.floor(height / 5);
    
    let maxDiffX = 0;
    let maxDiffY = 0;
    let totalMotion = 0;
    
    // 比较每个区域的差异，增加权重
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const startX = x * blockWidth;
        const startY = y * blockHeight;
        
        // 获取当前块的平均亮度
        this.videoContext.putImageData(this.currentFrameGray, 0, 0);
        const currentBlock = this.videoContext.getImageData(startX, startY, blockWidth, blockHeight);
        const currentBrightness = this.calculateAverageBrightness(currentBlock);
        
        // 获取上一帧同位置块的平均亮度
        this.videoContext.putImageData(this.lastFrameGray, 0, 0);
        const lastBlock = this.videoContext.getImageData(startX, startY, blockWidth, blockHeight);
        const lastBrightness = this.calculateAverageBrightness(lastBlock);
        
        // 计算亮度差异
        const diff = Math.abs(currentBrightness - lastBrightness);
        totalMotion += diff;
        
        // 相对于中心点的x和y偏移 (0,0是左上角)
        const xOffset = x - 2;  // -2 to 2
        const yOffset = y - 2;  // -2 to 2
        
        // 计算到中心的距离 - 用于权重计算
        const distanceFromCenter = Math.sqrt(xOffset * xOffset + yOffset * yOffset);
        const weight = 1.0 - Math.min(1.0, distanceFromCenter / 3.0);
        
        // 更新运动方向，并根据距离中心的远近加权
        if (diff > this.motionThreshold) {
          // 运动量与距离中心的权重相乘
          maxDiffX += xOffset * diff * weight * 1.5;  // 增加横向敏感度
          maxDiffY += yOffset * diff * weight * 1.5;  // 增加纵向敏感度
        }
      }
    }
    
    // 归一化并限制值范围在 -1 到 1 之间，提升响应度
    maxDiffX = Math.max(-1, Math.min(1, maxDiffX / 60));  // 降低分母以增强响应
    maxDiffY = Math.max(-1, Math.min(1, maxDiffY / 60));
    
    // 添加更强的非线性响应曲线，使小动作更敏感
    maxDiffX = Math.sign(maxDiffX) * Math.pow(Math.abs(maxDiffX), 0.7);
    maxDiffY = Math.sign(maxDiffY) * Math.pow(Math.abs(maxDiffY), 0.7);
    
    // 调整运动阈值 - 根据总体运动量动态调整
    this.motionThreshold = Math.max(5, 10 - totalMotion / 1000);
    
    return { x: maxDiffX, y: maxDiffY };
  }
  
  /**
   * 递归执行运动检测
   */
  async detectMotion() {
    if (!this.isRunning) return;
    
    try {
      // 将视频帧绘制到Canvas
      this.videoContext.drawImage(this.video, 0, 0, this.videoCanvas.width, this.videoCanvas.height);
      
      // 获取灰度图像数据
      const frame = this.videoContext.getImageData(0, 0, this.videoCanvas.width, this.videoCanvas.height);
      
      // 保存当前帧和上一帧
      this.lastFrameGray = this.currentFrameGray;
      this.currentFrameGray = frame;
      
      // 第一帧时初始化
      if (!this.lastFrameGray) {
        this.lastFrameGray = frame;
        requestAnimationFrame(() => this.detectMotion());
        return;
      }
      
      // 计算运动
      const motion = this.calculateMotion();
      
      // 检测是否有足够的运动判定为手部存在
      const motionMagnitude = Math.sqrt(motion.x * motion.x + motion.y * motion.y);
      this.handPresent = motionMagnitude > 0.05;
      
      // 更新运动数据
      if (this.handPresent) {
        // 平滑处理
        this.horizontalMovement = this.horizontalMovement * this.smoothingFactor + 
                               motion.x * (1 - this.smoothingFactor) * 5;
        
        this.verticalMovement = this.verticalMovement * this.smoothingFactor + 
                             motion.y * (1 - this.smoothingFactor) * 5;
      } else {
        // 逐渐衰减
        this.horizontalMovement *= 0.95;
        this.verticalMovement *= 0.95;
      }
      
      // 限制范围
      this.horizontalMovement = Math.max(-1, Math.min(1, this.horizontalMovement));
      this.verticalMovement = Math.max(-1, Math.min(1, this.verticalMovement));
      
      // 计算移动速度
      this.movementSpeed = {
        x: Math.abs(this.horizontalMovement),
        y: Math.abs(this.verticalMovement)
      };
      
      // 调用回调函数
      if (this.onHandUpdate) {
        this.onHandUpdate({
          handPresent: this.handPresent,
          verticalMovement: this.verticalMovement,
          horizontalMovement: this.horizontalMovement,
          movementSpeed: this.movementSpeed
        });
      }
    } catch (error) {
      console.error('运动检测错误:', error);
    }
    
    // 请求下一帧
    requestAnimationFrame(() => this.detectMotion());
  }
  
  /**
   * 获取当前手势数据
   */
  getGestureData() {
    return {
      handPresent: this.handPresent,
      verticalMovement: this.verticalMovement,
      horizontalMovement: this.horizontalMovement,
      movementSpeed: this.movementSpeed
    };
  }
}

// 导出模块
export default HandGestureController;