const tesseract = require('node-tesseract'); // 图片识别
const gm = require('gm'); // 图像处理

module.exports = {
  // 处理图片为相应的阈值的图片
  processImg(originImgPath, targetImgPath, thresholdVal = 21) {
    return new Promise((resolve, reject) => {
      gm(originImgPath)
        .threshold(thresholdVal, '%') // 若直接使用数值会导致输出图片空白
        .write(targetImgPath, (err) => {
          if(err) return reject(err);

          resolve(targetImgPath);
        });
    });
  },

  // 识别图片
  recognizeImg(imgPath, options) {
    options = Object.assign({psm: 7}, options);

    return new Promise((resolve, reject) => {
      tesseract
        .process(imgPath, options, (err, text) => {
          if(err) return reject(err);

          resolve(text.replace(/\s/g, ''));
        });
    });
  },
};