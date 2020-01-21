import { LitElement, html } from '../../../vendor/lit-element/lit-element.js'
import { repeat } from '../../../vendor/lit-element/lit-html/directives/repeat.js'
import * as uwg from '../../lib/uwg.js'
import feedCSS from '../../../css/com/posts/feed.css.js'
import './post.js'
import '../paginator.js'

const PAGE_SIZE = 25

export class PostsFeed extends LitElement {
  static get properties () {
    return {
      user: {type: Object},
      author: {type: String},
      topic: {type: String},
      posts: {type: Array}
    }
  }

  static get styles () {
    return feedCSS
  }

  constructor () {
    super()
    this.user = undefined
    this.author = undefined
    this.topic = undefined
    this.posts = undefined
    this.page = 0
  }

  async load () {
    var posts = await uwg.posts.list({
      topic: this.topic,
      author: this.author ? this.author : undefined,
      offset: this.page * PAGE_SIZE,
      limit: PAGE_SIZE,
      sort: 'name',
      reverse: true
    }, {includeProfiles: true})
    /* dont await */ this.loadFeedAnnotations(posts)
    this.posts = posts
    console.log(this.posts)
  }

  requestFeedPostsUpdate () {
    Array.from(this.shadowRoot.querySelectorAll('beaker-post'), el => el.requestUpdate())
  }

  async refreshFeed () {
    this.loadFeedAnnotations(this.posts)
  }

  async loadFeedAnnotations (posts) {
    for (let post of posts) {
      ;[post.votes, post.numComments] = await Promise.all([
        uwg.votes.tabulate(post.url),
        uwg.comments.count({href: post.url})
      ])
      this.requestFeedPostsUpdate()
    }
  }

  render () {
    return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <div class="feed">
        ${typeof this.posts === 'undefined' ? html`
          <div class="empty">
            <span class="spinner"></span>
          </div>
        ` : html`
          ${repeat(this.posts, post => html`
            <beaker-post
              .post=${post}
              user-url="${this.user.url}"
              @deleted=${this.onPostDeleted}
            ></beaker-post>
          `)}
          ${this.posts.length === 0
            ? html`
              <div class="empty">
                <div><span class="fas fa-image"></span></div>
                <div>
                  ${this.author
                    ? 'This user has not posted anything.'
                    : 'This is your feed. It will show posts from users you follow.'}
                </div>
              </div>
            ` : ''}
          <beaker-paginator
            page=${this.page}
            label="Showing posts ${(this.page * PAGE_SIZE) + 1} - ${(this.page + 1) * PAGE_SIZE}"
            @change-page=${this.onChangePage}
          ></beaker-paginator>
        `}
      </div>
    `
  }

  // events
  // =

  onChangePage (e) {
    this.page = e.detail.page
    this.posts = undefined
    this.load()
  }

  async onPostDeleted (e) {
    let post = e.detail.post
    this.posts = this.posts.filter(p => p.url !== post.url)
  }
}

customElements.define('beaker-posts-feed', PostsFeed)
