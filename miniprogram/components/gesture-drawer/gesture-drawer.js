Component({
  properties: {
    show: {
      type: Boolean,
      value: false
    }
  },

  data: {
    points: [], // 9个圆点的中心坐标和编号
    activePoints: [], // 已激活的圆点编号
    isDrawing: false,
    canvasWidth: 300,
    canvasHeight: 300,
    ctx: null
  },

  lifetimes: {
    attached() {
      // 调整参数，确保9个圆点完全显示在canvas内
      const r = 25; // 圆点半径
      const gap = 100; // 圆点间距
      const offset = 50; // 边距
      const points = [];
      let idx = 1;
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          points.push({
            x: offset + col * gap,
            y: offset + row * gap,
            num: idx++
          });
        }
      }
      this.setData({ points });
      // 初始化canvas
      const query = this.createSelectorQuery();
      query.select('#gestureCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvas = res[0].node;
          const ctx = canvas.getContext('2d');
          canvas.width = this.data.canvasWidth;
          canvas.height = this.data.canvasHeight;
          this.setData({ ctx }, () => {
            this.drawGesture();
          });
        });
    }
  },

  methods: {
    // 判断触摸点是否在某个圆点内
    getTouchPointNum(x, y) {
      for (const p of this.data.points) {
        const dx = x - p.x, dy = y - p.y;
        if (Math.sqrt(dx*dx + dy*dy) < 25) return p.num;
      }
      return null;
    },

    touchStart(e) {
      const { x, y } = e.touches[0];
      const num = this.getTouchPointNum(x, y);
      if (num) {
        this.setData({ isDrawing: true, activePoints: [num] }, this.drawGesture);
      }
    },

    touchMove(e) {
      if (!this.data.isDrawing) return;
      const { x, y } = e.touches[0];
      const num = this.getTouchPointNum(x, y);
      if (num && !this.data.activePoints.includes(num)) {
        this.data.activePoints.push(num);
        this.drawGesture();
      }
    },

    touchEnd() {
      this.setData({ isDrawing: false });
    },

    // 绘制所有内容
    drawGesture() {
      const { ctx, points, activePoints } = this.data;
      ctx.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
      // 画所有圆点
      points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 25, 0, Math.PI*2);
        ctx.strokeStyle = activePoints.includes(p.num) ? '#07c160' : '#ccc';
        ctx.lineWidth = 3;
        ctx.stroke();
        // 高亮点
        if (activePoints.includes(p.num)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 10, 0, Math.PI*2);
          ctx.fillStyle = '#07c160';
          ctx.fill();
        }
      });
      // 连线
      if (activePoints.length > 1) {
        ctx.beginPath();
        for (let i = 0; i < activePoints.length; i++) {
          const p = points[activePoints[i]-1];
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = '#07c160';
        ctx.lineWidth = 6;
        ctx.stroke();
      }
    },

    clearCanvas() {
      this.setData({ activePoints: [] });
      this.drawGesture();
    },

    confirmGesture() {
      if (this.data.activePoints.length < 2) {
        wx.showToast({ title: '请先绘制手势', icon: 'none' });
        return;
      }
      const gesture = this.data.activePoints.join('');
      this.triggerEvent('confirm', { gesture });
      this.clearCanvas();
    },

    close() {
      this.clearCanvas();
      this.triggerEvent('close');
    }
  }
}); 