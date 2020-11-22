import { DataModel, ModelPath, Path } from '@mcschema/core';
import { App, checkVersion, Previews } from '../../App';
import { Tracker } from '../../Tracker'
import { View } from '../../views/View';
import { Octicon } from '../Octicon';
import { Mounter } from '../../Mounter';
import { renderHtml } from '../../hooks/renderHtml';
import config from '../../../config.json'
import { locale } from '../../Locales';
import { BiomeNoisePreview } from '../../preview/BiomeNoisePreview';

const createPopupIcon = (type: string, icon: keyof typeof Octicon, popup: string) => {
  const div = document.createElement('div')
  div.className = `node-icon ${type}`
  div.addEventListener('click', evt => {
    div.getElementsByTagName('span')[0].classList.add('show')
    document.body.addEventListener('click', evt => {
      div.getElementsByTagName('span')[0].classList.remove('show')
    }, { capture: true, once: true })
  })
  div.insertAdjacentHTML('beforeend', `<span class="icon-popup">${popup}</span>${Octicon[icon]}`)
  return div
}

const treeViewObserver = (el: Element) => {
  el.querySelectorAll('.node[data-help]').forEach(e => {
    e.querySelector('.node-header')?.appendChild(
      createPopupIcon('node-help', 'info', e.getAttribute('data-help') ?? ''))
  })
  el.querySelectorAll('.node[data-error]').forEach(e => {
    e.querySelector('.node-header')?.appendChild(
      createPopupIcon('node-error', 'issue_opened', e.getAttribute('data-error') ?? ''))
  })
  el.querySelectorAll('.collapse.closed, button.add').forEach(e => {
    e.insertAdjacentHTML('afterbegin', Octicon.plus_circle)
  })
  el.querySelectorAll('.collapse.open, button.remove').forEach(e => {
    e.insertAdjacentHTML('afterbegin', Octicon.trashcan)
  })
}

const treeViewNodeInjector = (path: ModelPath, mounter: Mounter) => {

  let res = Object.keys(Previews).map(k => Previews[k])
    .filter(v => v.active(path))
    .map(v => {
      const id = mounter.registerClick(() => {
        Tracker.setPreview(v.getName())
        v.path = path
        App.preview.set(v)
      })
      return `<button data-id=${id}>${locale('preview')} ${Octicon.play}</button>`
    }).join('')

  if (path.pop().endsWith(new Path(['generator', 'biome_source', 'biomes']))) {
    const biomePreview = Previews.biome_noise as BiomeNoisePreview
    const biome = path.push('biome').get()
    const id = mounter.registerChange(el => {
      biomePreview.setBiomeColor(biome, (el as HTMLInputElement).value)
      biomePreview.state = {}
    })
    res += `<input type="color" value="${biomePreview.getBiomeHex(biome)}" data-id=${id}></input>`
  }
  return res
}

export const TreePanel = (view: View, model: DataModel) => {
  const mounter = new Mounter({ nodeInjector: treeViewNodeInjector })
  const getContent = () => {
    if (App.loaded.get()) {
      const path = new ModelPath(model)
      const rendered = model.schema.hook(renderHtml, path, model.data, mounter)
      const category = model.schema.category(path)
      if (rendered[1]) {
        return `<div class="node ${model.schema.type(path)}-node" ${category ? `data-category="${category}"` : ''}>
          <div class="node-header">${rendered[1]}</div>
          <div class="node-body">${rendered[2]}</div>
        </div>`
      }
      return rendered[2]
    }
    return '<div class="spinner"></div>'
  }
  const mountContent = (el: Element) => {
    el.innerHTML = getContent()
    treeViewObserver(el)
    mounter.mount(el)
  }
  const tree = view.register(el => {
    App.loaded.watchRun((value) => {
      if (!value) {
        // If loading is taking more than 100 ms, show spinner
        new Promise(r => setTimeout(r, 100)).then(() => {
          if (!App.loaded.get()) {
            mountContent(el)
          }
        })
      } else {
        mountContent(el)
      }
    })
    model.addListener({
      invalidated() {
        mountContent(el)
      }
    })
    ;(Previews.biome_noise as BiomeNoisePreview).biomeColors.watch(() => {
      mountContent(el)
    }, 'tree-panel')
  })
  const toggleMenu = (el: Element) => {
    el.classList.toggle('active')
    document.body.addEventListener('click', evt => {
      el.classList.remove('active')
    }, { capture: true, once: true })
  }
  return `<div class="panel tree-panel">
    <div class="panel-controls">
      <div class="btn" data-id="${view.onClick(() => {
        Tracker.reset(); model.reset(model.schema.default())
      })}">
        ${Octicon.history}
        <span data-i18n="reset"></span>
      </div>
      <div class="panel-menu">
        <div class="btn" data-id="${view.onClick(toggleMenu)}">
          ${Octicon.tag}
          <span data-id="${view.register(el => App.version.watch(v => el.textContent = v, 'tree-controls'))}">
            ${App.version.get()}
          </span>
        </div>
        <div class="panel-menu-list btn-group">
          ${config.versions
            .filter(v => checkVersion(v.id, App.model.get()!.minVersion ?? '1.16'))
            .reverse()
            .map(v => `
            <div class="btn" data-id="${view.onClick(() => {
              Tracker.setVersion(v.id); App.version.set(v.id)
            })}">
              ${v.id}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="panel-menu">
        <div class="btn" data-id="${view.onClick(toggleMenu)}">
          ${Octicon.kebab_horizontal}
        </div>
        <div class="panel-menu-list btn-group">
          <div class="btn" data-id="${view.onClick(() => {Tracker.undo(); model.undo()})}">
            ${Octicon.arrow_left}<span data-i18n="undo"></span>
          </div>
          <div class="btn" data-id="${view.onClick(() => {Tracker.redo(); model.redo()})}">
            ${Octicon.arrow_right}<span data-i18n="redo"></span>
          </div>
        </div>
      </div>
    </div>
    <div class="tree" data-id="${tree}"></div>
  </div>`
}
