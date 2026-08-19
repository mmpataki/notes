(async function() {
    // Theme toggle
    var savedTheme = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", savedTheme);
    updateThemeIcon(savedTheme);

    document.getElementById("theme-toggle").addEventListener("click", function() {
        var current = document.documentElement.getAttribute("data-theme");
        var next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("theme", next);
        updateThemeIcon(next);
    });

    function updateThemeIcon(theme) {
        document.getElementById("theme-toggle").innerHTML = theme === "dark" ? "&#9788;" : "&#9790;";
    }

    // Marked setup
    marked.use({ breaks: true });

    // Load manifest
    var fileTree = {};
    try {
        var resp = await fetch("manifest.json");
        fileTree = await resp.json();
    } catch(e) {
        console.error("Failed to load manifest:", e);
    }

    var HIDDEN_DIRS = ["assets", "notes-site", ".claude"];

    function buildTree(tree, container) {
        var folders = [];
        var files = [];

        for (var name in tree) {
            var value = tree[name];
            if (typeof value === "object" && value !== null && !value.path) {
                if (HIDDEN_DIRS.indexOf(name) === -1) {
                    folders.push([name, value]);
                }
            } else if (name.endsWith(".md")) {
                var path = typeof value === "string" ? value : value.path;
                var title = (typeof value === "object" && value.title) ? value.title : name.replace(/\.md$/, "");
                files.push([name, path, title]);
            }
        }

        var natSort = function(a, b) { return a[0].localeCompare(b[0], undefined, {numeric: true}); };
        folders.sort(natSort);
        files.sort(natSort);

        for (var i = 0; i < folders.length; i++) {
            var fname = folders[i][0];
            var subtree = folders[i][1];
            var folder = document.createElement("div");
            folder.className = "tree-item tree-folder";

            var label = document.createElement("div");
            label.className = "tree-label";
            label.textContent = fname;
            label.addEventListener("click", (function(f) {
                return function() { f.classList.toggle("open"); };
            })(folder));

            var children = document.createElement("div");
            children.className = "tree-children";
            buildTree(subtree, children);

            folder.appendChild(label);
            folder.appendChild(children);
            container.appendChild(folder);
        }

        for (var j = 0; j < files.length; j++) {
            var path = files[j][1];
            var title = files[j][2];
            var file = document.createElement("div");
            file.className = "tree-item tree-file";
            file.textContent = title;
            file.dataset.path = path;
            file.addEventListener("click", (function(p) {
                return function() { loadNote(p); };
            })(path));
            container.appendChild(file);
        }
    }

    buildTree(fileTree, document.getElementById("file-tree"));

    // Expand first level folders by default
    document.querySelectorAll("#file-tree > .tree-folder").forEach(function(f) {
        f.classList.add("open");
    });

    function getPath(value) {
        if (typeof value === "string") return value;
        if (typeof value === "object" && value.path) return value.path;
        return null;
    }

    function findAsset(filename) {
        function search(tree) {
            for (var name in tree) {
                var value = tree[name];
                var p = getPath(value);
                if (p && name === filename) {
                    return p;
                } else if (typeof value === "object" && !value.path) {
                    var found = search(value);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(fileTree) || filename;
    }

    function findNote(linkText) {
        var target = linkText.trim();
        if (!target.endsWith(".md")) target += ".md";
        function search(tree) {
            for (var name in tree) {
                var value = tree[name];
                var p = getPath(value);
                if (p && p.endsWith(".md")) {
                    if (name === target || p === target || p.endsWith("/" + target)) {
                        return p;
                    }
                    // Also match by title
                    if (typeof value === "object" && value.title) {
                        var titleFile = value.title.trim();
                        if (!titleFile.endsWith(".md")) titleFile += ".md";
                        if (titleFile === target) return p;
                    }
                } else if (typeof value === "object" && !value.path) {
                    var found = search(value);
                    if (found) return found;
                }
            }
            return null;
        }
        return search(fileTree);
    }

    async function loadNote(path) {
        try {
            var resp = await fetch(path);
            if (!resp.ok) throw new Error("Not found");
            var md = await resp.text();

            // Extract metadata from top of file
            var title = "";
            var date = "";
            var tags = [];
            var lines = md.split("\n");
            var contentStart = 0;

            for (var i = 0; i < Math.min(lines.length, 10); i++) {
                if (lines[i].match(/^title:\s*/)) {
                    title = lines[i].replace(/^title:\s*/, "").trim();
                    contentStart = i + 1;
                } else if (lines[i].match(/^date:\s*/)) {
                    date = lines[i].replace(/^date:\s*/, "").trim();
                    contentStart = i + 1;
                } else if (lines[i].match(/^tags:\s*/)) {
                    var tagLine = lines[i].replace(/^tags:\s*/, "");
                    tags = tagLine.match(/#[\w][\w-]*/g) || [];
                    tags = tags.filter(function(t) { return t !== "#public"; });
                    contentStart = i + 1;
                } else if (lines[i].trim() === "" && contentStart > 0) {
                    contentStart = i + 1;
                } else {
                    break;
                }
            }

            md = lines.slice(contentStart).join("\n");

            // Use title from metadata, fallback to filename
            var noteName = title || decodeURIComponent(path).split("/").pop().replace(/\.md$/, "");

            // Build breadcrumb
            var parts = path.split("/");
            parts.pop();
            var breadcrumbHtml = parts.join(" / ");
            if (breadcrumbHtml) breadcrumbHtml += " / ";
            breadcrumbHtml += "<span>" + noteName + "</span>";
            document.getElementById("breadcrumb").innerHTML = breadcrumbHtml;

            // Build title + meta
            var headerHtml = '<h1 class="note-title">' + noteName + "</h1>";
            if (date || tags.length) {
                headerHtml += '<div class="note-meta">';
                if (date) headerHtml += '<span class="note-date">date: ' + date + '</span>';
                if (tags.length) {
                    if (date) headerHtml += '<br>';
                    headerHtml += '<span class="note-tags">tags: ';
                    headerHtml += tags.map(function(t) {
                        return '<span class="tag">' + t + '</span>';
                    }).join(" ");
                    headerHtml += '</span>';
                }
                headerHtml += "</div>";
            }

            // Preserve extra blank lines as spacing (Obsidian behavior)
            md = md.replace(/\n{3,}/g, function(match) {
                var extra = match.length - 2;
                var spacer = "";
                for (var s = 0; s < extra; s++) spacer += "\n&nbsp;\n";
                return "\n\n" + spacer;
            });

            // Convert Obsidian image embeds
            md = md.replace(/!\[\[([^\]]+)\]\]/g, function(match, file) {
                var ext = file.split(".").pop().toLowerCase();
                if (["png","jpg","jpeg","gif","svg","webp"].indexOf(ext) !== -1) {
                    var imgPath = findAsset(file) || file;
                    return "![" + file + "](" + encodeURIComponent(imgPath) + ")";
                }
                return match;
            });

            // Convert Obsidian wikilinks [[note]] and [[note|display]]
            md = md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, function(match, link, display) {
                // Find the note in manifest
                var resolvedPath = findNote(link);
                if (resolvedPath) {
                    return "[" + (display || link) + "](" + encodeURIComponent(resolvedPath) + ")";
                }
                return "[" + (display || link) + "](#)";
            });

            var html = marked.parse(md);
            document.getElementById("note-content").innerHTML = headerHtml + html;

            // Convert cardlink code blocks to preview cards
            document.querySelectorAll("#note-content pre code.language-cardlink").forEach(function(code) {
                var pre = code.parentElement;
                var lines = code.textContent.trim().split("\n");
                var data = {};
                lines.forEach(function(line) {
                    var m = line.match(/^(\w+):\s*(.*)/);
                    if (m) data[m[1]] = m[2].replace(/^["']|["']$/g, "");
                });
                if (!data.url) return;
                var card = document.createElement("a");
                card.className = "cardlink";
                card.href = data.url;
                card.target = "_blank";
                card.rel = "noopener";
                var content = '<div class="cardlink-content">';
                content += '<div class="cardlink-title">' + (data.title || data.url) + '</div>';
                if (data.description) content += '<div class="cardlink-description">' + data.description + '</div>';
                content += '<div class="cardlink-host">';
                if (data.favicon) content += '<img src="' + data.favicon + '">';
                content += (data.host || '') + '</div></div>';
                if (data.image) content += '<img class="cardlink-image" src="' + data.image + '">';
                card.innerHTML = content;
                pre.parentNode.replaceChild(card, pre);
            });

            // Add copy buttons to code blocks
            document.querySelectorAll("#note-content pre").forEach(function(pre) {
                var wrapper = document.createElement("div");
                wrapper.className = "code-wrapper";
                pre.parentNode.insertBefore(wrapper, pre);
                wrapper.appendChild(pre);
                var btn = document.createElement("button");
                btn.className = "copy-btn";
                btn.textContent = "Copy";
                btn.addEventListener("click", function() {
                    var code = pre.querySelector("code");
                    var text = code ? code.textContent : pre.textContent;
                    navigator.clipboard.writeText(text).then(function() {
                        btn.textContent = "Copied!";
                        btn.classList.add("copied");
                        setTimeout(function() {
                            btn.textContent = "Copy";
                            btn.classList.remove("copied");
                        }, 1500);
                    });
                });
                wrapper.appendChild(btn);
            });

            // Make internal links navigate within the app
            document.querySelectorAll("#note-content a").forEach(function(a) {
                var href = a.getAttribute("href");
                if (href && !href.startsWith("http") && href !== "#") {
                    a.addEventListener("click", function(e) {
                        e.preventDefault();
                        var notePath = decodeURIComponent(href);
                        loadNote(notePath);
                    });
                }
            });

            // Highlight active file in sidebar
            document.querySelectorAll(".tree-file").forEach(function(el) {
                el.classList.remove("active");
                if (el.dataset.path === path) {
                    el.classList.add("active");
                    var parent = el.parentElement;
                    while (parent) {
                        if (parent.classList && parent.classList.contains("tree-folder")) {
                            parent.classList.add("open");
                        }
                        parent = parent.parentElement;
                    }
                }
            });

            // Build outline panel
            buildOutline();

            history.replaceState(null, "", "#" + path);
        } catch(e) {
            document.getElementById("note-content").innerHTML = "<p>Failed to load note: " + e.message + "</p>";
            console.error(e);
        }
    }

    window.loadNote = loadNote;

    if (window.location.hash) {
        loadNote(window.location.hash.slice(1));
    }


    // Build outline from headings
    function buildOutline() {
        var container = document.getElementById("outline-tree");
        container.innerHTML = "";
        var headings = document.querySelectorAll("#note-content h2, #note-content h3, #note-content h4, #note-content h5");
        if (!headings.length) return;

        // Give each heading an id for scrolling
        headings.forEach(function(h, i) {
            if (!h.id) h.id = "heading-" + i;
        });

        // Build nested structure
        var stack = [{ level: 1, el: container }];

        headings.forEach(function(h) {
            var level = parseInt(h.tagName[1]);
            var item = document.createElement("div");
            item.className = "outline-item outline-h" + level;

            var label = document.createElement("div");
            label.className = "outline-label";
            label.textContent = h.textContent;
            label.addEventListener("click", function(e) {
                e.stopPropagation();
                h.scrollIntoView({ behavior: "smooth", block: "start" });
                // Toggle children if has them
                if (item.classList.contains("has-children")) {
                    item.classList.toggle("open");
                }
            });
            item.appendChild(label);

            // Find correct parent level
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }

            var parent = stack[stack.length - 1].el;
            // If parent is an outline-item, add to its children container
            if (parent.classList && parent.classList.contains("outline-item")) {
                var children = parent.querySelector(".outline-children");
                if (!children) {
                    children = document.createElement("div");
                    children.className = "outline-children";
                    parent.appendChild(children);
                    parent.classList.add("has-children");
                    parent.classList.add("open");
                }
                children.appendChild(item);
            } else {
                parent.appendChild(item);
            }

            stack.push({ level: level, el: item });
        });

        // Highlight active heading on scroll
        var content = document.querySelector(".content");
        content.addEventListener("scroll", function() {
            var scrollTop = content.scrollTop;
            var active = null;
            headings.forEach(function(h) {
                if (h.offsetTop - 80 <= scrollTop) active = h;
            });
            container.querySelectorAll(".outline-item").forEach(function(el) {
                el.classList.remove("active");
            });
            if (active) {
                var target = container.querySelector('[class*="outline-h"]');
                container.querySelectorAll(".outline-label").forEach(function(lbl) {
                    if (lbl.textContent === active.textContent) {
                        lbl.parentElement.classList.add("active");
                    }
                });
            }
        });
    }

    // Mobile menu toggle
    var menuToggle = document.getElementById("menu-toggle");
    var sidebarOverlay = document.getElementById("sidebar-overlay");

    menuToggle.addEventListener("click", function() {
        document.getElementById("sidebar").classList.toggle("open");
    });

    sidebarOverlay.addEventListener("click", function() {
        document.getElementById("sidebar").classList.remove("open");
    });

    // Close sidebar on mobile when a note is clicked
    document.getElementById("file-tree").addEventListener("click", function(e) {
        if (e.target.classList.contains("tree-file") && window.innerWidth <= 768) {
            document.getElementById("sidebar").classList.remove("open");
        }
    });

    // Resize handle
    var handle = document.getElementById("resize-handle");
    var sidebar = document.querySelector(".sidebar");
    var dragging = false;

    handle.addEventListener("mousedown", function(e) {
        dragging = true;
        handle.classList.add("active");
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        e.preventDefault();
    });

    document.addEventListener("mousemove", function(e) {
        if (!dragging) return;
        var newWidth = e.clientX;
        if (newWidth >= 180 && newWidth <= window.innerWidth * 0.5) {
            sidebar.style.width = newWidth + "px";
        }
    });

    document.addEventListener("mouseup", function() {
        if (dragging) {
            dragging = false;
            handle.classList.remove("active");
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
        }
    });
})();
