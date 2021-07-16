create table authors (
  id int not null,
  name text,
  constraint authors_pkey primary key (id)
);
create table books (
  id int not null,
  title text,
  author_id int not null,
  constraint books_pkey primary key (id),
  constraint author foreign key (author_id) REFERENCES authors (id)
);
insert into authors (id, name) values (1, 'F. Scott Fitzgerald');
insert into books (id, title, author_id) values (1, 'The Great Gatsby', 1);