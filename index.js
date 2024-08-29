
const { get } = require('axios');
const { load } = require('cheerio');
const app = require('express')();
const port = 3000;

const data = {
  '/': (req, res) => {
    res.json({
      content: `Welcome to rule34 api. This website lets you request a rule34 post or search and returns you the content of page.`,
      examples: {
        post: '`/post?id=YOUR_POST_ID` returns the source of the image (if found)',
        search: '`/search?tags=tag1+tag2+tag3&limit=100` returns an array with the id of every image that contains all the tags, with a maxium defined by the limit (default 42, one r34 page)',
        random: '`/random` returns an approximatively random image. Be careful, it doesn\'t block any tag!'
      }
    });
  },
  '/post': (req, res) => {
    if (!Object.keys(req.query).includes('id')) res.status(404).json({ error: 'Post ID not provided. use `/post?id=X`.' });
    
    get(`https://rule34.xxx/index.php?page=post&s=view&id=${req.query.id}`)
      .then(async res_ => {
        const $ = load(res_.data);
        let img = $('#image');
        let vid = $('#gelcomVideoPlayer');
        let isVid = false;
        if (!img[0]) isVid = true;
        if (isVid && !vid[0]) return res.status(404).json({ error: 'Post not found. Invalid ID.'});
        
        let pages = [ `https://rule34.xxx/index.php?page=post&s=view&id=${req.query.id}` ];
        pages = pages.concat(Array.from($('#paginator > a')).filter(link => !isNaN(parseInt(link.children[0].data))).map(link => `https://rule34.xxx/index.php${link.attribs.onclick.replace('document.location=\'', '').replace('\'; return false;', '')}`));
        let comms = [];

        for (let link of pages){
          let moreComms = await findComments(link);
          comms = comms.concat(moreComms);
        };

        let allTags = $('title')[0].children[0].data.split(/ /g);
        
        await res.json({
          link: `https://rule34.xxx/index.php?page=post&s=view&id=${req.query.id}`,
          src: isVid ? vid[0].children[1].attribs.src : img[0].attribs.src,
          alt: allTags.slice(3, allTags.length - 2).join(' '),
          video: isVid,
          comments: comms
        });
      })
      .catch(err => {
        console.log(err);
        res.status(500).json({ error: `Your request was probably invalid. Too high limit may be a cause.` });
      });
  },
  '/search': (req, res) => {
    if (!Object.keys(req.query).includes('tags')) res.status(400).json({ error: 'Tags not provided. Use `/search?tags=tag1+tag2`. To get posts without tags, use `/list`.' });

    findPosts(`https://rule34.xxx/index.php?page=post&s=list&tags=${req.query.tags}`, req.query.limit ? req.query.limit : 42)
      .then(post => res.json({ posts: post }))
      .catch(err => res.status(err.status ? err.status : 500).json({ error: `Your request was probably invalid. Too high limit may be a cause.` }));
  },
  '/random': (req, res) => {
    const url = `https://rule34.xxx/index.php?page=post&s=list&tags=all&pid=${Math.floor(Math.random() * 200000)}`;
    get(url)
      .then(res__ => {
        const $$ = load(res__.data);
        const posts = $$('.preview');
        const post = posts[Math.floor(Math.random() * Array.from(posts).length)];
        
        get(`https://rule34.xxx${post.parent.attribs.href}`)
          .then(res___ => {
            const $$$ = load(res___.data);
            let img = $$$('#image');
            let vid = $$$('#gelcomVideoPlayer');
            let isVid = false;
            if (!img[0]) isVid = true;
            if (isVid && !vid[0]) return res.status(404).json({ error: 'Oops! Something bad happened.'});

            findComments(`https://rule34.xxx${post.parent.attribs.href}`)
              .then(comments => {
                res.json({
                  link: `https://rule34.xxx${post.parent.attribs.href}`,
                  src: isVid ? vid[0].children[1].attribs.src : img[0].attribs.src,
                  tags: post.attribs.alt.trim(),
                  video: isVid,
                  comments: comments
                });
              })
              .catch(err => res.status(err.status ? err.status : 500).json({ error: `Something bad happened at the loading of the comments.` }));
          })
          .catch(err => res.status(err.status ? err.status : 500).json({ error: `Your request was probably invalid. Too high limit may be a cause.` }));
      })
      .catch(err => res.status(err.status ? err.status : 500).json({ error: `Oops! Something wrong is within the code...` }));
  }
};

for (const [ url, method ] of Object.entries(data)) app.get(url, method);

app.listen(port, () => {
  console.log(`Local server started at http://localhost:${port}/`);
});

function findPosts(url, limit = 42) {
  return new Promise((resolve, reject) => {
    const posts = [];
    const maxPages = Math.ceil(limit / 42);
    const promises = [];

    for (let i = 0; i < maxPages; i++) {
      promises.push(
        get(`${url}&pid=${i * 42}`)
          .then(res => {
            const $ = load(res.data);
            const postsList = Array.from($('.preview')).slice(0, limit - (i * 42));
            for (let prev of postsList) posts.push(prev.parent.attribs.id.replace('p', ''));
            return posts;
          })
          .catch(err => {
            reject(err.status ? err.status : 500);
          })
      );
    };

    Promise.all(promises)
      .then(() => resolve(posts))
      .catch(error => reject(error));
  });
}

function findComments(url){
  return new Promise((resolve, reject) => {
    const comments = [];
    get(url)
      .then(res => {
        const $ = load(res.data);
        const commentList = $('#comment-list > div');
        const commentsAuthor = $('#comment-list > div > .col1 > a');
        const commentsId = $('#comment-list > div > .col1 > span');
        const commentsDate = $('#comment-list > div > .col1 > b');
        const comments2 = $('#comment-list > div > .col2');
      
        for (let i = 0; i < commentList.length; i++){
          comments.push({
            author: commentsAuthor[i].children[0].data,
            id: parseInt(commentsId[i].children[0].data.replace('>> #', '')),
             date: new Date(Date.parse(commentsDate[i].children[0].data.replace('\nPosted on ', '').replace('\nScore: ', ''))),
            content: comments2[i].children[0].data.trim()
          });
        };
      
        resolve(comments);
      })
      .catch(err => {
        console.log(`Error ${err.status}!`);
        console.log(err);
        reject(500);
      });
  });
};
