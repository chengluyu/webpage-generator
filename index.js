"use strict";

(() => {

  const CONFIG = {
    sitename: "Site Name",
    excerptParagraphCount: 3,
  };

  let colors = require("colors")
    , fs = require("fs")
    , jade = require("jade")
    , marked = require("./marked")
    , moment = require("moment")
    , path = require("path")
    , unidecode = require("unidecode")
    ;

  const args = process.argv.slice(2);

  if (args.length !== 2) {
    console.log("missing arguments");
    process.exit(0);
  }

  const SOURCE_DIR = args[0];
  const TARGET_DIR = args[1];

  const CONTENT_DIR = path.join(SOURCE_DIR, "./content/");
  const TEMPLATE_DIR = path.join(SOURCE_DIR, "./template/");
  const ASSETS_DIR = path.join(SOURCE_DIR, "./assets/");

  const markedOptions = {

  };

  // render contents

  function extractExcerpts(tokens) {
    // 问题：如何提取摘要
    // 用 CONFIG.excerptParagraphCount 可以设置摘要的段落数
    // 但是遇到引言和列表该怎么办？

    let advance = (() => {
      let i = 0;
      return () => i >= tokens.length ? null : tokens[i++];
    })();

    let n = CONFIG.excerptParagraphCount
      , excerpts = [];

    function sequence() {
      while (n > 0) {
        let token = advance();
        if (token === null) return;
        switch (token.type) {
          // simply ignore
          case 'hr':
            break;
          // copy to excerpts
          case 'space':
          case 'code':
          case 'table':
          case 'html':
          case 'paragraph':
          case 'text':
            excerpts.push(token);
            n--;
            break;

          // convert heading into paragraph
          case 'heading':
            excerpts.push({
              type: "paragraph",
              text: token.text
            });
            n--;
            break;
          
          case 'blockquote_start':
            excerpts.push(token);
            sequence();
            excerpts.push({ type: 'blockquote_end' })
            break;

          case 'blockquote_end':
            return;

          case 'list_start':
            excerpts.push(token);
            while (true) {
              excerpts.push(token = advance());
              if (token.type === 'list_end')
                break;
            }
            n--;
            break;
          default:
            throw new Error("infinite loop!")
        } // end switch
      } // end while
    } // end function sequence

    sequence();
    return excerpts;
  }

  function render(raw) {
    let tokens = marked.lexer(raw);
    let excerpts = extractExcerpts(tokens);
    excerpts.links = tokens.links;

    return {
      excerpts: marked.parser(excerpts),
      content: marked.parser(tokens)
    };
  }

  function extractFrontMatter(raw) {
    // cut off front-matter
    let regex = /^-{3,}\n((?:\w+\:.+\n)+)-{3,}$/m;
    let result = regex.exec(raw);
    let frontmatter = {};

    if (result) {
      result[1].split('\n').forEach(kv => {
        let pair = kv.split(/\s*:\s*/);
        if (pair.length === 2) {
          frontmatter[pair[0]] = pair[1];
        }
      });
    } else {
      throw new Error("No front matter")
    }

    frontmatter.raw = raw.substring(result[0].length);
    return frontmatter;
  }

  console.log("========  1  Rendering Contents  ========".blue);

  let contents = fs.
      readdirSync(CONTENT_DIR).map(x => path.join(CONTENT_DIR, x)).
      filter(x => fs.lstatSync(x).isFile() && path.extname(x) === ".md").
      map(x => {
        let frontmatter = extractFrontMatter(fs.readFileSync(x, "utf8"));
        let cooked = render(frontmatter.raw);
        return {
          metadata: {
            title: frontmatter.title,
            date: frontmatter.date || fs.lstatSync(x).birthtime,
            permalink: frontmatter.permalink || unidecode(frontmatter.title).replace(/[^\W\-_]+|\s+/, '-'),
            published: frontmatter.published || true
          },
          excerpts: cooked.excerpts,
          content: cooked.content
        };
      }).filter(x => x.metadata.published).sort((x, y) => x.metadata.date > y.metadata.date);

  console.log(`Render complete, ${contents.length} file(s) in total.`)

  // template

  console.log("========  2  Compiling Templates ========".blue);

  function template(filename) { return path.join(TEMPLATE_DIR, filename); }

  const INDEX_TEMPLATE = template("index.jade");
  const ARCHIVE_TEMPLATE = template("archives.jade");
  const ARTICLE_TEMPLATE = template("article.jade");

  const JADE_OPTIONS = {
    pretty: "  ", // used to debug
  };

  // const renderIndex = jade.compile(INDEX_TEMPLATE, JADE_OPTIONS);
  const renderArchive = jade.compileFile(ARCHIVE_TEMPLATE, JADE_OPTIONS);
  const renderArticle = jade.compileFile(ARTICLE_TEMPLATE, JADE_OPTIONS);

  function save(permalink, content) {
    let filename = path.join(TARGET_DIR, permalink + '.html');
    console.log("OK".green, "Save file to", filename.cyan);
    fs.writeFileSync(filename, content);
  }

  // generate contents
  console.log("======== 3.1 Generating Contents ========".blue);
  contents.forEach(x => {
    let html = renderArticle(x);
    save(x.metadata.permalink, html);
  });

  // generate archives
  console.log("======== 3.2 Generating Archives ========".blue);
  save("archives", renderArchive({ all: contents }));

  console.log("======== 3.3 Generating Homepage ========".blue);
  // generate index
  // save("index", renderIndex({ partial: contents.slice(0, 5) }));
})();