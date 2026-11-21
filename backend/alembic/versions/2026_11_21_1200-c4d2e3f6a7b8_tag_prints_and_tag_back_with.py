"""tag print log, and the partner codes printed on each tag's back

Revision ID: c4d2e3f6a7b8
Revises: b3c1d2e4f5a6
Create Date: 2026-11-21 12:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d2e3f6a7b8'
down_revision: Union[str, None] = 'b3c1d2e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('pieces') as b:
        b.add_column(sa.Column('tag_back_with', sa.String(length=200), nullable=True))
    op.create_table(
        'tag_prints',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('piece_id', sa.String(length=36), nullable=False),
        sa.Column('item_code', sa.String(length=20), nullable=False),
        sa.Column('printed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reason', sa.String(length=20), nullable=False),
        sa.Column('back_code', sa.String(length=20), nullable=True),
        sa.Column('back_with', sa.String(length=200), nullable=True),
        sa.Column('by_name', sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(['piece_id'], ['pieces.id'], name='fk_tag_prints_piece_id_pieces', ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id', name='pk_tag_prints'),
    )
    op.create_index('ix_tag_prints_piece_id', 'tag_prints', ['piece_id'])


def downgrade() -> None:
    op.drop_index('ix_tag_prints_piece_id', table_name='tag_prints')
    op.drop_table('tag_prints')
    with op.batch_alter_table('pieces') as b:
        b.drop_column('tag_back_with')
