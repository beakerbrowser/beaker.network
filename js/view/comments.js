import { LitElement, html } from '../../vendor/lit-element/lit-element.js'
import '../com/comments/feed.js'
import '../com/search-input.js'
import '../com/topics.js'

export class CommentsView extends LitElement {
  static get properties () {
    return {
      user: {type: Object}
    }
  }
 
  createRenderRoot () {
    return this // no shadow dom
  }

  constructor () {
    super()
    this.user = undefined
  }

  async load () {
    await this.requestUpdate()
    // Array.from(this.querySelectorAll('[loadable]'), el => el.load())
  }

  render () {
    if (!this.user) return html``
    return html`
      <div class="layout right-col">
        <main>
          <beaker-comments-feed loadable .user=${this.user}></beaker-comments-feed>
        </main>
        <nav>
          <beaker-search-input placeholder="Search your network"></beaker-search-input>
          <beaker-topics loadable></beaker-topics>
        </nav>
      </div>
    `
  }

  // events
  // =

}

customElements.define('beaker-comments-view', CommentsView)
