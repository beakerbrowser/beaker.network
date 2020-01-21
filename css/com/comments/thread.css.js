import {css} from '../../../vendor/lit-element/lit-element.js'
import buttonsCSS from '../../buttons.css.js'
import votectrlCSS from '../votectrl.css.js'

const cssStr = css`
${buttonsCSS}
${votectrlCSS}

:host {
  --body-font-size: 15px;
  --header-font-size: 12px;
  --title-font-size: 13px;
  --footer-font-size: 12px;
  --title-color: var(--color-link);
  --header-color: #888;
  --footer-color: #888;
  --footer-background: #fff;
  --replies-left-margin: 12px;
  --comment-top-margin: 16px;
  --comment-left-margin: 2px;
  --composer-padding: 14px 18px;
  --composer-margin: 0;
  --composer-border: 1px solid #ccd;

  display: block;
  border-radius: 4px;
  background: #fff;
}

a {
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

beaker-comment-composer {
  border: var(--composer-border);
  padding: var(--composer-padding);
  margin: var(--composer-margin);
}

.comments {
}

.comments .comments {
  margin-left: var(--replies-left-margin);
}

.comment {
  display: grid;
  grid-template-columns: 20px 1fr;
  align-items: baseline;
  margin-top: var(--comment-top-margin);
  margin-left: var(--comment-left-margin);
  border-left: 2px solid #f5f5f5;
}

.header {
  display: flex;
  align-items: center;
  padding: 4px 16px 4px;
  font-size: var(--header-font-size);
  line-height: var(--header-font-size);
  color: var(--header-color);
}

.header .menu {
  padding: 2px 4px;
}

.title {
  font-size: var(--title-font-size);
  color: var(--title-color);
  margin-right: 10px;
  line-height: 17px;
}

.body {
  color: rgba(0, 0, 0, 0.9);
  padding: 0 16px;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: var(--body-font-size);
  line-height: 1.4;
  white-space: pre-line;
}

.footer {
  display: flex;
  align-items: center;
  font-size: var(--footer-font-size);
  color: var(--footer-color);
  background: var(--footer-background);
  padding: 4px 14px;
}

beaker-reactions {
  display: flex;
  flex-wrap: wrap;
  margin-left: 4px;
}

.footer > a,
.footer > span {
  margin: 0 5px;
  color: inherit;
}

.footer > a:first-child,
.footer > span:first-child {
  margin-left: 0;
}

.permalink {
  color: inherit;
}

.comment beaker-comment-composer {
  margin: 10px 16px;
  --input-font-size: var(--body-font-size);
}

`
export default cssStr
