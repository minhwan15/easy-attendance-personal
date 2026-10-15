const home=new URL('/notebook.html',location.origin);home.search=location.search;location.replace(home.href);
