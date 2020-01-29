import { LitElement, html } from '../../vendor/lit-element/lit-element.js'
import * as uwg from '../lib/uwg.js'
import * as toast from '../com/toast.js'
import '../com/profiles/aside.js'
import '../com/posts/post.js'
import '../com/comments/thread.js'
import '../com/search-input.js'
import '../com/topics.js'

export class PostView extends LitElement {
  static get properties () {
    return {
      user: {type: Object},
      author: {type: String},
      topic: {type: String},
      filename: {type: String},
      post: {type: Object}
    }
  }
 
  createRenderRoot () {
    return this // no shadow dom
  }

  constructor () {
    super()
    this.user = undefined
    this.author = undefined
    this.topic = undefined
    this.filename = undefined
    this.post = undefined
  }

  get path () {
    return `/posts/${this.topic}/${this.filename}`
  }

  async load () {
    var post = await uwg.posts.get(this.author, this.path)
    ;[post.votes, post.numComments] = await Promise.all([
      uwg.votes.tabulate(post.url, undefined, {includeProfiles: true}),
      uwg.comments.count({href: post.url})
    ])
    this.post = post
    console.log(this.post)

    await this.requestUpdate()
    Array.from(this.querySelectorAll('[loadable]'), el => el.load())

    var comments = await uwg.comments.thread(post.url)
    await loadCommentAnnotations(comments)
    post.comments = comments
    await this.requestUpdate()
  }

  render () {
    if (!this.post) return html``
    return html`
      <style>
        beaker-post {
          margin-bottom: 16px;
        }
        .votes {
          margin: -14px 0 10px 40px;
          color: #667;
          font-size: 12px;
          background: #f8f8fc;
          padding: 6px 10px;
          border-radius: 4px;
        }
        .votes strong {
          font-weight: 500;
        }
        .votes a {
          color: inherit;
          text-decoration: none;
        }
        .votes a:hover {
          text-decoration: underline;
        }
        beaker-comments-thread {
          margin-left: 40px;
          margin-bottom: 100px;
        }
      </style>
      <div class="layout right-col">
        <main>
          <beaker-post
            expanded
            .post=${this.post}
            user-url="${this.user ? this.user.url : undefined}"
            @deleted=${this.onPostDeleted}
          ></beaker-post>
          ${this.post.votes.upvotes.length || this.post.votes.downvotes.length ? html`
            <div class="votes">
              ${this.post.votes.upvotes.length ? html`
                <div>
                  <strong>Upvoted by:</strong>
                  ${this.renderVoters(this.post.votes.upvotes)}
                </div>
              ` : ''}
              ${this.post.votes.downvotes.length ? html`
                <div>
                  <strong>Downvoted by:</strong>
                  ${this.renderVoters(this.post.votes.downvotes)}
                </div>
              ` : ''}
            </div>
          ` : ''}
          ${this.post.comments ? html`
            <beaker-comments-thread
              .comments=${this.post ? this.post.comments : undefined}
              href="${this.post ? this.post.url : undefined}"
              user-url="${this.user ? this.user.url : undefined}"
              @submit-comment=${this.onSubmitComment}
              @delete-comment=${this.onDeleteComment}
            ></beaker-comments-thread>
          ` : html`<div class="spinner" style="margin-left: 40px"></div>`}
        </main>
        <aside>
          <beaker-profile-aside class="dark" loadable .user=${this.user} id=${this.author}></beaker-profile-aside>
          <beaker-search-input placeholder="Search your network"></beaker-search-input>
          <beaker-topics loadable></beaker-topics>
        </aside>
      </div>
    `
  }

  renderVoters (voters) {
    var els = []
    for (let i = 0; i < voters.length; i++) {
      let profile = voters[i]
      let comma = (i !== voters.length - 1) ? ', ' : ''
      els.push(html`
        <a href=${'/' + profile.url.slice('hyper://'.length)} title=${profile.title}>${profile.title}</a>${comma}
      `)
    }
    return els
  }

  // events
  // =

  async onClickNav (id) {
    this.subview = id
    await this.requestUpdate()
    Array.from(this.querySelectorAll('[loadable]'), el => el.load())
  }

  async onSubmitComment (e) {
    // add the new comment
    try {
      var {isEditing, editTarget, href, parent, content} = e.detail
      if (isEditing) {
        await uwg.comments.update(editTarget, {content})
      } else {
        await uwg.comments.add({href, parent, content})
      }
    } catch (e) {
      alert('Something went wrong. Please let the Beaker team know! (An error is logged in the console.)')
      console.error('Failed to add comment')
      console.error(e)
      return
    }
    this.load()
  }

  async onDeleteComment (e) {
    let comment = e.detail.comment

    // delete the comment
    try {
      await uwg.comments.remove(comment)
    } catch (e) {
      alert('Something went wrong. Please let the Beaker team know! (An error is logged in the console.)')
      console.error('Failed to delete comment')
      console.error(e)
      return
    }
    toast.create('Comment deleted')
    this.load()
  }

  async onPostDeleted (e) {
    window.location = `/${this.author}`
  }
}

customElements.define('beaker-post-view', PostView)

async function loadCommentAnnotations (comments) {
  await Promise.all(comments.map(async (comment) => {
    comment.votes = await uwg.votes.tabulate(comment.url)
    if (comment.replies) await loadCommentAnnotations(comment.replies)
  }))
  comments.sort((a, b) => {
    return (b.votes.upvotes.length - b.votes.downvotes.length) - (a.votes.upvotes.length - a.votes.downvotes.length)
  })
}