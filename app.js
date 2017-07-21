const agent = require('superagent').agent();
const cheerio = require('cheerio');
const schedule = require('node-schedule');
const config = require('./config');
// const exec = require('child_process').exec;
// const captcha = require('./captcha');

// automatically comment to a post
// @param {object} commentFormData
// @param {string} topicUrl - the topic url you want to comment
const autoComment = function(commentFormData, topicUrl) {
  agent
    .post(`${topicUrl}/add_comment`)
    .type('form')
    .send(commentFormData)
    .redirects(2)
    .end((err, res) => {
      const $ = cheerio.load(res.text);
      const commentMsg = $('#comments li:first-child .reply-doc > p').text().trim();

      if(err || res.error) return console.log(`Error: ${err || `code: ${res.status}`}`);

      if(!commentMsg) return console.log('Warning: You haven\'t commented to a post!');
      
      console.log(`You have succeeded in replying a post(${topicUrl})! message: ${commentMsg}`);
    });
};

// access a post
// @param {string} topicUrl - the topic url you want to comment
const accessTopicUrl = function(topicUrl) {
  agent
    .get(topicUrl)
    .end(function(err, res) {
      const $ = cheerio.load(res.text);
      const form = $('.comment-form');

      const commentFormData = {
        ck: form.find('input[name="ck"]').val(),
        rv_comment: config.comment[Math.floor(Math.random() * config.comment.length)],
        start: form.find('input[name="start"]').val(),
        submit_btn: form.find('input[name="submit_btn"]').val(),
      };

      autoComment(commentFormData, topicUrl);
    });
};

// reply posts of a group page
const replyPosts = function() {
  agent
    .get(config.group)
    .end(function(err, res) {
      const $ = cheerio.load(res.text);
      const hasDbcl2 = res.req._headers['cookie'].match(/.*(dbcl2=[\w:"]+);?.*/); // `dbcl2` attribute exits in cookies only after login
      const loginUser = $('.nav-user-account .bn-more').text().trim(); // login username
      const topicObj = $('.olt tbody').children();

      if(!hasDbcl2) return console.log('You haven\'t logged in and can\'t comment!');

      console.log(`You have logged in as \`${loginUser}\`! Wait for automatically commenting...`);

      for(let i = 1; i < topicObj.length; i++) {
        const replyNumber = topicObj.eq(i).find('td').eq(2).text().trim();

        if(replyNumber < 1) {
          const topicUrl = topicObj.eq(i).find('td').eq(0).find('a').attr('href');

          accessTopicUrl(topicUrl);
        }
      }
    });
};

const loginFormData = {
            source: 'group',
            redir: 'https://www.douban.com/',
            form_email: config.accountName,
            form_password: config.password,
            login: '登录',
          };

agent
  .post('https://accounts.douban.com/login')
  .type('form')
  .query({source: 'group'})
  .set(config.headers)
  .send(loginFormData)
  .redirects(1)
  .end((err, res) => {
    const $ = cheerio.load(res.text);
    const error = $('#item-error').text().trim(); // error message

    if(error || (res.error && res.status != 404)) return console.log(`Error: ${error || `code: ${res.status}`}`);

    schedule.scheduleJob('*/5 * * * *', () => {
      console.log('\x1b[34m%s\x1b[0m', `[${(new Date).toLocaleString()}] Start to reply posts...`);

      replyPosts();
    });
  });
