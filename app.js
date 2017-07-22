const agent = require('superagent').agent();
const cheerio = require('cheerio');
const schedule = require('node-schedule');
const fs = require('fs');
const config = require('./config');
const captcha = require('./captcha');

// @param {boolean} recognCaptcha - if open captcha recognization
async function login(recognCaptcha) {
  let res, $, captchaSolution, captchaImg;

  if(recognCaptcha) {
    res = await agent.get('https://accounts.douban.com/login');
    $ = cheerio.load(res.text);
    captchaImg = $('#captcha_image').attr('src');

    if(captchaImg) {
      await agent
        .get(captchaImg)
        .pipe(fs.createWriteStream('captcha.jpg')); // get the captcha img

      await new Promise((resolve, reject) => setTimeout(resolve, 1000)); // wait for the captcha picture to be written totally

      await captcha.processImg('./captcha.jpg', './test.jpg')
        .then(captcha.recognizeImg)
        .then((text) => {
          captchaSolution = text;
        });
    }
  }

  const loginFormData = {
            source: 'group',
            redir: 'https://www.douban.com/',
            form_email: config.accountName,
            form_password: config.password,
            'captcha-solution': captchaSolution || '', // captcha, if exits
            'captcha-id': (recognCaptcha && captchaImg) ? $('.captcha_block').find('input[name="captcha-id"]').val() : '',  
            login: '登录',
          };

  try {
    res = await agent
      .post('https://accounts.douban.com/login')
      .type('form')
      .query({source: 'group'})
      .set(config.headers)
      .send(loginFormData)
      .redirects(1);
  } catch(err) {
    if(err.status != 404) throw new Error(`Error: code: ${err.status}`);

    if(!res) res = {
      text: err.response.res.text
    };
  }
  
  $ = cheerio.load(res.text);
  const error = $('#item-error').text().trim(); // error message

  if(error) throw new Error(`Error: ${error}`);
}

// access a group page and find topic urls that would be commented
async function replyPosts() {
  const res = await agent.get(config.group); // can't use end() if using promises

  const $ = cheerio.load(res.text);
  const hasDbcl2 = res.req._headers['cookie'].match(/.*(dbcl2=[\w:"]+);?.*/); // `dbcl2` attribute exits in cookies only after login
  const loginUser = $('.nav-user-account .bn-more').text().trim(); // login username
  const topicObj = $('.olt tbody').children();
  const topicUrlArray = [];

  if(!hasDbcl2) throw new Error('You haven\'t logged in and can\'t comment!');

  console.log(`You have logged in as \`${loginUser}\`! Wait for automatically commenting...`);

  for(let i = 1; i < topicObj.length; i++) {
    const replyNumber = topicObj.eq(i).find('td').eq(2).text().trim();

    if(replyNumber < 1) {
      const topicUrl = topicObj.eq(i).find('td').eq(0).find('a').attr('href');

      topicUrlArray.push(topicUrl);
    }
  }

  return topicUrlArray;
}

// access a post
// @param {string} topicUrl - the topic url you want to comment
async function accessTopicUrl(topicUrl) {
  const res = await agent.get(topicUrl);

  const $ = cheerio.load(res.text);
  const form = $('.comment-form');

  const commentFormData = {
    ck: form.find('input[name="ck"]').val(),
    rv_comment: config.comment[Math.floor(Math.random() * config.comment.length)],
    start: form.find('input[name="start"]').val(),
    submit_btn: form.find('input[name="submit_btn"]').val(),
  };

  return {
    commentFormData,
    topicUrl,
  };
}

// automatically comment on a post
// @param {object} commentFormData
// @param {string} topicUrl - the topic url you want to comment
async function autoComment(commentFormData, topicUrl) {
  const res = await agent
    .post(`${topicUrl}/add_comment`)
    .type('form')
    .send(commentFormData)
    .redirects(2);

  const $ = cheerio.load(res.text);
  const commentMsg = $('#comments li:first-child .reply-doc > p').text().trim();

  if(res.error) throw new Error(`Error: code: ${res.status}`);

  if(!commentMsg) throw new Error('Warning: You haven\'t commented on a post!');
  
  console.log(`You have succeeded in commenting on a post(${topicUrl})! message: ${commentMsg}`);
}

async function afterLogin() {
  let topicUrlArray = [];

  try {
    topicUrlArray = await replyPosts();

    for(let i = 0; i < topicUrlArray.length; i++) {
      const {commentFormData, topicUrl} = await accessTopicUrl(topicUrlArray[i]);

      await autoComment(commentFormData, topicUrl);
    }
  } catch(err) {
    return console.log(err.message);
  }
  
  console.log('\x1b[34m%s\x1b[0m', `[${(new Date).toLocaleString()}] Finish replying posts :)`);
}

// @param {boolean} recognCaptcha - if open captcha recognization
async function robot(recognCaptcha = false) {
  try {
    await login(recognCaptcha);
  } catch(err) {
    return console.log(err.message);
  }

  schedule.scheduleJob('*/1 * * * *', () => {
        console.log('\x1b[34m%s\x1b[0m', `[${(new Date).toLocaleString()}] Start to reply posts...`);

        afterLogin();
      });
}

if(module.parent) {
  module.exports = robot;
} else {
  robot(true);
}
