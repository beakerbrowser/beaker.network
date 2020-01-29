import { LitElement, html } from '../../../vendor/lit-element/lit-element.js'
import { repeat } from '../../../vendor/lit-element/lit-html/directives/repeat.js'
import commentsThreadCSS from '../../../css/com/comments/thread.css.js'
import { timeDifference } from '../../lib/time.js'
import { writeToClipboard } from '../../lib/clipboard.js'
import * as uwg from '../../lib/uwg.js'
import { emit } from '../../lib/dom.js'
import * as contextMenu from '../context-menu.js'
import * as toast from '../toast.js'
import './composer.js'

export class CommentsThread extends LitElement {
  static get properties () {
    return {
      comments: {type: Array},
      href: {type: String},
      userUrl: {type: String, attribute: 'user-url'},
      activeReplies: {type: Object},
      activeEdits: {type: Object},
      composerPlaceholder: {type: String, attribute: 'composer-placeholder'}
    }
  }

  constructor () {
    super()
    this.comments = null
    this.href = ''
    this.userUrl = ''
    this.activeReplies = {}
    this.activeEdits = {}
    this.composerPlaceholder = undefined
  }

  getUserVote (comment) {
    return uwg.votes.getVoteBy(comment && comment.votes, this.userUrl)
  }

  getKarma (comment) {
    var votes = comment && comment.votes
    if (!votes) return undefined
    return votes.upvotes.length - votes.downvotes.length
  }

  render () {
    return html`
      <link rel="stylesheet" href="/webfonts/fontawesome.css">
      <beaker-comment-composer
        href="${this.href}"
        placeholder=${this.composerPlaceholder || 'Add a comment'}
      ></beaker-comment-composer>
      ${this.renderComments(this.comments)}
    `
  }

  renderComments (comments) {
    if (!comments.length) return ''
    return html`
      <div class="comments">
        ${repeat(comments, c => c.url, c => this.renderComment(c))}
      </div>
    `
  }

  renderComment (comment) {
    var userVote = this.getUserVote(comment)
    var karma = this.getKarma(comment)
    return html`
      <div class="comment">
        <div class="votectrl">
          <a class="upvote ${userVote === 1 ? 'selected' : ''}" @click=${e => this.onClickUpvote(e, comment)}>
            <span class="fas fa-caret-up"></span>
          </a>
          <div class="karma ${userVote === 1 ? 'upvoted' : userVote === -1 ? 'downvoted' : ''}">${karma}</div>
          <a class="downvote ${userVote === -1 ? 'selected' : ''}" @click=${e => this.onClickDownvote(e, comment)}>
            <span class="fas fa-caret-down"></span>
          </a>
        </div>
        <div class="content">
          <div class="header">
            <a class="title" href="/${comment.drive.url.slice('hyper://'.length)}">${comment.drive.title}</a>
            <a class="permalink" href="${comment.url}">${timeDifference(comment.stat.ctime, true, 'ago')}</a>
            <button class="menu transparent" @click=${e => this.onClickMenu(e, comment)}><span class="fas fa-fw fa-ellipsis-h"></span></button>
          </div>
          <div class="body">${comment.content}</div>
          <div class="footer">
            <a href="#" @click=${e => this.onClickToggleReply(e, comment.url)}>
              ${this.activeReplies[comment.url]
                ? html`<span class="fas fa-fw fa-times"></span> Cancel reply`
                : html`<span class="fas fa-fw fa-reply"></span> Reply`}
            </a>
            ${comment.drive.url === this.userUrl ? html`
              <a href="#" @click=${e => this.onClickToggleEdit(e, comment.url)}>
                ${this.activeEdits[comment.url]
                  ? html`<span class="fas fa-fw fa-times"></span> Cancel edit`
                  : html`<span class="fas fa-fw fa-pencil-alt"></span> Edit`}
              </a>
            ` : ''}
          </div>
          ${this.activeReplies[comment.url] ? html`
            <beaker-comment-composer
              href="${comment.stat.metadata.href}"
              parent="${comment.url}"
              @submit-comment=${e => this.onSubmitComment(e, comment.url)}
            ></beaker-comment-composer>
          ` : ''}
          ${this.activeEdits[comment.url] ? html`
            <beaker-comment-composer
              editing
              href="${comment.stat.metadata.href}"
              parent="${comment.url}"
              .comment=${comment}
              @submit-comment=${e => this.onSubmitEdit(e, comment.url)}
            ></beaker-comment-composer>
          ` : ''}
          ${comment.replies && comment.replies.length ? this.renderComments(comment.replies) : ''}
        </div>
      </div>
    `
  }

  // events
  // =

  async onClickToggleReply (e, url) {
    this.activeReplies[url] = !this.activeReplies[url]
    this.activeEdits[url] = false
    await this.requestUpdate()
    if (this.activeReplies[url]) {
      this.shadowRoot.querySelector(`beaker-comment-composer[parent="${url}"]`).focus()
    }
  }

  async onClickToggleEdit (e, url) {
    this.activeEdits[url] = !this.activeEdits[url]
    this.activeReplies[url] = false
    await this.requestUpdate()
    if (this.activeEdits[url]) {
      this.shadowRoot.querySelector(`beaker-comment-composer[parent="${url}"]`).focus()
    }
  }

  onSubmitComment (e, url) {
    this.activeReplies[url] = false
    this.requestUpdate()
  }

  onSubmitEdit (e, url) {
    this.activeEdits[url] = false
    this.requestUpdate()
  }

  async onClickUpvote (e, comment) {
    e.preventDefault()
    e.stopPropagation()
    
    var userVote = this.getUserVote(comment)
    await uwg.votes.put(comment.url, userVote === 1 ? 0 : 1)
    if (userVote === 1) {
      comment.votes.upvotes = comment.votes.upvotes.filter(url => url !== this.userUrl)
    } else {
      comment.votes.upvotes.push(this.userUrl)
    }
    this.requestUpdate()
  }

  async onClickDownvote (e, comment) {
    e.preventDefault()
    e.stopPropagation()
    
    var userVote = this.getUserVote(comment)
    await uwg.votes.put(comment.url, userVote === -1 ? 0 : -1)
    if (userVote === -1) {
      comment.votes.downvotes = comment.votes.downvotes.filter(url => url !== this.userUrl)
    } else {
      comment.votes.downvotes.push(this.userUrl)
    }
    this.requestUpdate()
  }

  onClickMenu (e, comment) {
    e.preventDefault()
    e.stopPropagation()

    var items = [
      {
        icon: 'fas fa-fw fa-link',
        label: 'Copy comment URL',
        click: () => {
          writeToClipboard(comment.url)
          toast.create('Copied to your clipboard')
        }
      }
    ]

    if (this.userUrl === comment.drive.url) {
      items.push({icon: 'fas fa-fw fa-trash', label: 'Delete comment', click: () => this.onClickDelete(comment) })
    }

    var rect = e.currentTarget.getClientRects()[0]
    contextMenu.create({
      x: rect.left,
      y: rect.bottom + 8,
      left: true,
      roomy: true,
      noBorders: true,
      style: `padding: 4px 0`,
      items
    })
  }

  onClickDelete (comment) {
    if (!confirm('Are you sure?')) return
    emit(this, 'delete-comment', {bubbles: true, composed: true, detail: {comment}})
  }
}
CommentsThread.styles = commentsThreadCSS

customElements.define('beaker-comments-thread', CommentsThread)