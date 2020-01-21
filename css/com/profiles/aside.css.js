import {css} from '../../../vendor/lit-element/lit-element.js'
import buttonsCSS from '../../buttons.css.js'
import spinnerCSS from '../spinner.css.js'

const cssStr = css`
${buttonsCSS}
${spinnerCSS}

:host {
  display: block;
  position: relative;
  border: 1px solid #ccd;
  border-radius: 4px;
  box-sizing: border-box;
  padding: 16px 12px 16px 16px;
  margin: 0px 0 10px;
}

:host(.dark) {
  background: #f9f9fc;
  border: 0;
}

a {
  color: #889;
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

img {
  display: block;
  margin: 0 auto;
  width: 80px;
  height: 80px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #ccd;
}

.title {
  font-size: 24px;
  margin: 12px 0 0;
  line-height: 1;
  text-align: center;
}

.title a {
  color: inherit;
}

.info {
  font-size: 14px;
  margin: 6px 0 0;
  text-align: center;
}

.id {
  font-size: 15px;
}

.ctrls {
  margin: 14px 0 0;
}

button {
  display: block;
  font-size: 14px;
  width: 100%;
  padding: 8px 12px !important;
}

button .fa-fw {
  margin-right: 4px;
}

button:hover {
  background: #eef !important;
}

`
export default cssStr
